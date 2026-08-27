"""El que vacía la cola de mensajes salientes.

La cola existía desde hace tiempo —con reintentos, respaldo exponencial y
candado contra duplicados— pero nadie la vaciaba: los mensajes se encolaban y
ahí se quedaban. Un pedido se confirmaba y el cliente nunca recibía nada.

Corre como su propio proceso: `python -m app.despachador`. Se pensó primero
meterlo en el worker de voz para no agregar una pieza, pero ese proceso reparte
el trabajo por llamada y la cola habría avanzado solo mientras alguien estuviera
al teléfono — justo al revés de lo que se necesita.

Se pueden levantar varios a la vez sin coordinarlos: `outbox_reclamar` usa
`for update skip locked`, así que dos nunca toman la misma fila.

Lo que gobiernan las constantes:

- `VENCE_EN_HORAS`: un mensaje viejo ya no sirve y hace daño; nadie quiere
  recibir hoy la confirmación de un pedido de la semana pasada. Si la cola
  estuvo detenida, lo acumulado se descarta en vez de dispararse junto.
- `CADA_RECORDATORIO_SEG` y `VENTANA_RECORDATORIO_HORAS`: cada cuánto se
  revisa si hay citas por recordar y con cuánta anticipación.
- `CADA_CIERRE_SEG` y `CONVERSACION_FRIA_MIN`: una conversación de texto se da
  por terminada cuando lleva dos horas sin mensajes; ahí se escribe su cierre.
- `CADA_CAMPANA_SEG`: cada cuánto se revisa qué campañas tienen a quién hablarle.

Las llamadas salientes no reintentan por el outbox. La fila queda terminal
tras el primer intento y el siguiente lo decide `campana_contacto` con
`siguiente_intento`: si el outbox reintentara por su cuenta, la persona
recibiría seis llamadas en unas horas y mañana otra fila más.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from app.cierre import ModeloNoContesto, resumir
from app.salientes import SinTroncal, marcar
from app.supabase_client import Agenda

log = logging.getLogger("despachador")

INTERVALO_SEG = 20
POR_VUELTA = 25
VENCE_EN_HORAS = 12
CADA_RECORDATORIO_SEG = 3600
VENTANA_RECORDATORIO_HORAS = 24
CADA_CIERRE_SEG = 600
CONVERSACION_FRIA_MIN = 120
CADA_CAMPANA_SEG = 300
MAX_INTENTOS_OUTBOX = 6


class Mensajero(Protocol):
    """Lo que el despachador necesita de un canal para poder mandar."""

    async def enviar_texto(self, destino: str, texto: str) -> str: ...


@dataclass(frozen=True, slots=True)
class Tanda:
    reclamados: int
    enviados: int
    fallidos: int
    vencidos: int = 0
    marcando: int = 0


def _sin_mas_intentos(fila: dict) -> bool:
    """La misma cuenta que hace `outbox_marcar_error` para rendirse."""
    intentos = int(fila.get("intentos") or 0)
    maximo = int(fila.get("max_intentos") or MAX_INTENTOS_OUTBOX)
    return intentos >= maximo


def _pesos(monto: object) -> str:
    try:
        return f"${float(monto):,.0f}".replace(",", " ")
    except (TypeError, ValueError):
        return "$0"


def redactar(plantilla: str, payload: dict) -> str:
    """El texto que le llega al cliente.

    En corto y sin adornos: el mensaje se lee en la pantalla de bloqueo, y lo
    que importa es el código y el total.
    """
    negocio = payload.get("negocio", "el negocio")
    nombre = (payload.get("cliente") or "").split(" ")[0]
    saludo = f"{nombre}, " if nombre else ""

    if plantilla == "pedido":
        renglones = [
            f"{i.get('cantidad', 1)}× {i.get('nombre', '')}"
            + (f" ({i['notas']})" if i.get("notas") else "")
            + f" — {_pesos(i.get('subtotal'))}"
            for i in (payload.get("items") or [])
        ]
        entrega = (
            f"A domicilio: {payload['direccion']}"
            if payload.get("tipo") == "domicilio" and payload.get("direccion")
            else "Para recoger en el local"
        )
        return (
            f"{saludo}tu pedido en *{negocio}* quedó confirmado.\n\n"
            + "\n".join(renglones)
            + f"\n\nTotal: {_pesos(payload.get('total'))}\n"
            + f"{entrega}\n"
            + f"Código: *{payload.get('codigo', '')}*\n\n"
            + "Si algo está mal, respóndenos por aquí."
        )

    if plantilla == "resena":
        return (
            f"{saludo or 'Hola, '}gracias por venir a *{negocio}*. "
            "¿Cómo te fue del 1 al 5? Responde solo con el número."
        )

    if plantilla == "pago":
        return (
            f"{saludo or 'Hola, '}tienes un pago pendiente con *{negocio}*: "
            f"{payload.get('concepto', 'servicio')} por {_pesos(payload.get('monto'))}.\n"
            f"Puedes pagar aquí: {payload.get('enlace_url', '')}"
        )

    if plantilla == "campana":
        return str(payload.get("mensaje") or "").strip()

    if plantilla == "confirmacion":
        return (
            f"¡Listo, {nombre or 'todo'}! Tu {payload.get('servicio', 'cita')} en "
            f"*{negocio}* quedó apartada.\n\n"
            f"Tu código es *{payload.get('codigo', '')}*. "
            "Si necesitas cambiarla, respóndenos por aquí."
        )

    if plantilla == "recordatorio":
        return (
            f"{saludo or 'Hola, '}te recordamos tu "
            f"{payload.get('servicio', 'cita')} en *{negocio}*.\n\n"
            "Responde *confirmo* o *cancelo* y lo resolvemos por aquí."
        )

    return (
        f"{saludo}cancelamos tu {payload.get('servicio', 'cita')} en *{negocio}*. "
        "Cuando quieras agendar de nuevo, escríbenos."
    )


class Despachador:
    def __init__(
        self,
        agenda: Agenda,
        mensajero: Mensajero,
        por_vuelta: int = POR_VUELTA,
        llm: object | None = None,
    ) -> None:
        self.agenda = agenda
        self.mensajero = mensajero
        self.por_vuelta = por_vuelta
        self.llm = llm
        self._ultimo_recordatorio = 0.0
        self._ultimo_cierre = 0.0
        self._ultima_campana = 0.0
        self._salientes: set[asyncio.Task] = set()

    async def tanda(self) -> Tanda:
        """Una vuelta: reclama lo que toca, lo manda y marca el resultado.

        Lo vencido se marca fallido de una vez, no por la via de los reintentos:
        cada reintento solo lo encontraria mas viejo. Marcar una llamada tarda
        lo que tarde en contestar la persona, asi que se lanza aparte y la cola
        sigue con lo demas; esas cuentan en `marcando`, no en `enviados`. El
        error de un envio se guarda en la fila: es lo que el dueño va a leer
        cuando pregunte por que un mensaje no llego. Si con ese error el outbox
        se rinde y la fila era de campaña, el contacto queda `fallido` para que
        la campaña pueda terminar.
        """
        pendientes = await self.agenda.outbox_reclamar(self.por_vuelta)
        enviados = fallidos = vencidos = marcando = 0
        limite = datetime.now(UTC) - timedelta(hours=VENCE_EN_HORAS)

        for fila in pendientes:
            creado = fila.get("creado")
            if creado is not None and creado < limite:
                vencidos += 1
                motivo = f"vencido: encolado hace mas de {VENCE_EN_HORAS} h"
                await self.agenda.outbox_marcar_vencido(fila["id"], motivo)
                await self._contacto_fallido(fila, motivo)
                continue
            try:
                if fila["canal"] == "llamada":
                    tarea = asyncio.create_task(self._marcar(fila))
                    self._salientes.add(tarea)
                    tarea.add_done_callback(self._salientes.discard)
                    marcando += 1
                    continue
                if fila["canal"] != "whatsapp":
                    raise ValueError(f"canal no soportado: {fila['canal']}")
                texto = redactar(fila["plantilla"], fila["payload"])
                await self.mensajero.enviar_texto(fila["destino"], texto)
                await self.agenda.outbox_marcar_enviado(fila["id"])
                if fila.get("campana_contacto_id"):
                    await self.agenda.campana_contacto_resultado(
                        fila["campana_contacto_id"], "enviado", None, None
                    )
                enviados += 1
            except Exception as error:
                fallidos += 1
                await self.agenda.outbox_marcar_error(fila["id"], str(error))
                if _sin_mas_intentos(fila):
                    await self._contacto_fallido(fila, str(error))
                log.warning("no se pudo enviar %s: %s", fila["id"], error)

        return Tanda(len(pendientes), enviados, fallidos, vencidos, marcando)

    async def _contacto_fallido(self, fila: dict, motivo: str) -> None:
        contacto = fila.get("campana_contacto_id")
        if not contacto:
            return
        try:
            await self.agenda.campana_contacto_resultado(contacto, "fallido", motivo[:200])
        except Exception:
            log.exception("no se pudo marcar fallido el contacto %s", contacto)

    async def recordatorios(self) -> int:
        """Encola el recordatorio de las citas de mañana.

        Vive aqui y no en pg_cron a proposito: pg_cron hay que habilitarlo a
        mano en el tablero de Supabase, y un negocio cuyo dueño no lo encendio
        se quedaria sin recordatorios sin que nadie se entere. El proceso que
        ya corre lo hace solo.
        """
        return await self.agenda.encolar_recordatorios(VENTANA_RECORDATORIO_HORAS)

    async def _marcar(self, fila: dict) -> None:
        """Un solo intento por fila: el outbox no vuelve a marcar.

        Si no contesto o el puente fallo, la fila queda terminal y el contacto
        en `sin_respuesta`; cuando volver a intentar lo decide `campana_contacto`.
        Corre como tarea suelta, asi que nada puede escapar de aqui: un error al
        anotar el resultado se registra y ya.
        """
        contacto = fila.get("campana_contacto_id")
        try:
            try:
                from app.config import settings

                sala = await marcar(settings(), fila["tenant_id"], fila["destino"], fila["payload"])
                await self.agenda.outbox_marcar_enviado(fila["id"])
                log.info("llamada saliente en %s a %s", sala, fila["destino"])
            except SinTroncal as error:
                await self.agenda.outbox_marcar_vencido(fila["id"], str(error))
                if contacto:
                    await self.agenda.campana_contacto_resultado(contacto, "fallido", str(error)[:200])
            except Exception as error:
                await self.agenda.outbox_marcar_vencido(fila["id"], str(error))
                if contacto:
                    await self.agenda.campana_contacto_resultado(contacto, "sin_respuesta", str(error)[:200])
                log.warning("no se pudo marcar a %s: %s", fila["destino"], error)
        except Exception:
            log.exception("no se pudo anotar el resultado de marcar a %s", fila.get("destino"))

    async def campanas(self) -> int:
        """Encola lo que las campañas activas tengan que decir hoy."""
        cerradas = await self.agenda.campana_cerrar_terminadas()
        if cerradas:
            log.info("%d campañas terminadas", cerradas)
        return await self.agenda.campana_encolar()

    async def cierres(self) -> int:
        """Escribe motivo, resultado y resumen de las conversaciones frias.

        Una conversacion donde la persona nunca dijo nada se cierra sin motivo
        y no se vuelve a intentar. Si el modelo fallo, se deja abierta para el
        siguiente ciclo: cerrarla a ciegas seria irreversible.
        """
        if self.llm is None:
            return 0
        cerradas = 0
        for fila in await self.agenda.conversaciones_por_resumir(CONVERSACION_FRIA_MIN):
            turnos = await self.agenda.turnos_de_conversacion(fila["id"])
            try:
                cierre = await resumir(self.llm, turnos)
            except ModeloNoContesto as error:
                log.warning("cierre de %s pospuesto: %s", fila["id"], error)
                continue
            if cierre is None:
                cierre_vacio = ("sin motivo claro", "sin_resultado", "")
                await self.agenda.conversacion_cerrar(fila["tenant_id"], fila["id"], *cierre_vacio)
                continue
            await self.agenda.conversacion_cerrar(
                fila["tenant_id"], fila["id"], cierre.motivo, cierre.resultado, cierre.resumen
            )
            cerradas += 1
        return cerradas

    async def correr(self, intervalo: float = INTERVALO_SEG) -> None:
        """El ciclo. Nunca muere por un error de una tanda.

        Al cancelarlo espera las llamadas que siguen marcando: si no, mueren
        contra un pool ya cerrado y la fila se queda reclamada sin resultado.
        """
        try:
            await self._ciclo(intervalo)
        except asyncio.CancelledError:
            await self.esperar_salientes()
            raise

    async def esperar_salientes(self) -> None:
        if self._salientes:
            await asyncio.gather(*self._salientes, return_exceptions=True)

    async def _ciclo(self, intervalo: float) -> None:
        while True:
            try:
                ahora = asyncio.get_running_loop().time()
                if ahora - self._ultimo_recordatorio >= CADA_RECORDATORIO_SEG:
                    self._ultimo_recordatorio = ahora
                    cuantos = await self.recordatorios()
                    if cuantos:
                        log.info("%d recordatorios encolados", cuantos)

                if ahora - self._ultima_campana >= CADA_CAMPANA_SEG:
                    self._ultima_campana = ahora
                    encolados = await self.campanas()
                    if encolados:
                        log.info("%d contactos de campaña encolados", encolados)

                if ahora - self._ultimo_cierre >= CADA_CIERRE_SEG:
                    self._ultimo_cierre = ahora
                    cerradas = await self.cierres()
                    if cerradas:
                        log.info("%d conversaciones cerradas con resumen", cerradas)

                resultado = await self.tanda()
                if resultado.reclamados:
                    log.info(
                        "cola: %d reclamados, %d enviados, %d fallidos, %d vencidos, %d marcando",
                        resultado.reclamados, resultado.enviados,
                        resultado.fallidos, resultado.vencidos, resultado.marcando,
                    )
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("la vuelta del despachador fallo")
            await asyncio.sleep(intervalo)


async def _principal() -> None:
    from app.supabase_client import agenda
    from channels.whatsapp.cliente import WhatsAppCliente

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    from app.llm_texto import cliente_texto

    from app.config import settings

    await agenda.conectar()
    cliente = WhatsAppCliente()
    llm = cliente_texto(settings())
    try:
        log.info("despachador arriba, revisando la cola cada %ds", INTERVALO_SEG)
        await Despachador(agenda, cliente, llm=llm).correr()
    finally:
        await cliente.cerrar()
        await agenda.cerrar()


if __name__ == "__main__":
    try:
        asyncio.run(_principal())
    except KeyboardInterrupt:
        pass
