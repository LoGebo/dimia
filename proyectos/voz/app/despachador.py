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
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Protocol

from app.cierre import resumir
from app.salientes import SinTroncal, marcar
from app.supabase_client import Agenda

log = logging.getLogger("despachador")

INTERVALO_SEG = 20
POR_VUELTA = 25
# Un mensaje viejo ya no sirve y hace daño: nadie quiere recibir hoy la
# confirmación de un pedido de la semana pasada. Si la cola estuvo detenida,
# lo acumulado se descarta en vez de dispararse todo junto al reanudar.
VENCE_EN_HORAS = 12
# Cada cuanto se revisa si hay citas por recordar, y con cuanta anticipacion.
CADA_RECORDATORIO_SEG = 3600
VENTANA_RECORDATORIO_HORAS = 24
# Una conversacion de texto se da por terminada cuando lleva dos horas sin
# mensajes; ahi se escribe su cierre.
CADA_CIERRE_SEG = 600
CONVERSACION_FRIA_MIN = 120
# Cada cuanto se revisa que campañas tienen a quien hablarle.
CADA_CAMPANA_SEG = 300


class Mensajero(Protocol):
    """Lo que el despachador necesita de un canal para poder mandar."""

    async def enviar_texto(self, destino: str, texto: str) -> str: ...


@dataclass(frozen=True, slots=True)
class Tanda:
    reclamados: int
    enviados: int
    fallidos: int
    vencidos: int = 0


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
        # El texto ya viene redactado por campana_redactar, con nombre y negocio.
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
        """Una vuelta: reclama lo que toca, lo manda y marca el resultado."""
        pendientes = await self.agenda.outbox_reclamar(self.por_vuelta)
        enviados = fallidos = vencidos = 0
        limite = datetime.now(UTC) - timedelta(hours=VENCE_EN_HORAS)

        for fila in pendientes:
            creado = fila.get("creado")
            if creado is not None and creado < limite:
                vencidos += 1
                # Se marca fallido de una vez, no por la via de los reintentos:
                # cada reintento solo lo encontraria mas viejo.
                await self.agenda.outbox_marcar_vencido(
                    fila["id"], f"vencido: encolado hace mas de {VENCE_EN_HORAS} h"
                )
                continue
            try:
                if fila["canal"] == "llamada":
                    # Marcar tarda lo que tarde en contestar la persona: se
                    # lanza aparte y la cola sigue con lo demas.
                    tarea = asyncio.create_task(self._marcar(fila))
                    self._salientes.add(tarea)
                    tarea.add_done_callback(self._salientes.discard)
                    enviados += 1
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
                # El error se guarda en la fila: es lo que el dueño va a leer
                # cuando pregunte por que un mensaje no llego.
                await self.agenda.outbox_marcar_error(fila["id"], str(error))
                log.warning("no se pudo enviar %s: %s", fila["id"], error)

        return Tanda(len(pendientes), enviados, fallidos, vencidos)

    async def recordatorios(self) -> int:
        """Encola el recordatorio de las citas de mañana.

        Vive aqui y no en pg_cron a proposito: pg_cron hay que habilitarlo a
        mano en el tablero de Supabase, y un negocio cuyo dueño no lo encendio
        se quedaria sin recordatorios sin que nadie se entere. El proceso que
        ya corre lo hace solo.
        """
        return await self.agenda.encolar_recordatorios(VENTANA_RECORDATORIO_HORAS)

    async def _marcar(self, fila: dict) -> None:
        contacto = fila.get("campana_contacto_id")
        try:
            from app.config import settings

            sala = await marcar(settings(), fila["tenant_id"], fila["destino"], fila["payload"])
            await self.agenda.outbox_marcar_enviado(fila["id"])
            log.info("llamada saliente en %s a %s", sala, fila["destino"])
        except SinTroncal as error:
            await self.agenda.outbox_marcar_vencido(fila["id"], str(error))
            if contacto:
                await self.agenda.campana_contacto_resultado(contacto, "fallido", str(error))
        except Exception as error:
            # No contesto o el puente fallo: se reintenta mañana dentro de la ventana.
            await self.agenda.outbox_marcar_error(fila["id"], str(error))
            if contacto:
                await self.agenda.campana_contacto_resultado(contacto, "sin_respuesta", str(error)[:200])
            log.warning("no se pudo marcar a %s: %s", fila["destino"], error)

    async def campanas(self) -> int:
        """Encola lo que las campañas activas tengan que decir hoy."""
        cerradas = await self.agenda.campana_cerrar_terminadas()
        if cerradas:
            log.info("%d campañas terminadas", cerradas)
        return await self.agenda.campana_encolar()

    async def cierres(self) -> int:
        """Escribe motivo, resultado y resumen de las conversaciones frias."""
        if self.llm is None:
            return 0
        cerradas = 0
        for fila in await self.agenda.conversaciones_por_resumir(CONVERSACION_FRIA_MIN):
            turnos = await self.agenda.turnos_de_conversacion(fila["id"])
            cierre = await resumir(self.llm, turnos)
            if cierre is None:
                # Sin nada que leer no hay cierre, pero tampoco se vuelve a intentar.
                cierre_vacio = ("sin motivo claro", "sin_resultado", "")
                await self.agenda.conversacion_cerrar(fila["tenant_id"], fila["id"], *cierre_vacio)
                continue
            await self.agenda.conversacion_cerrar(
                fila["tenant_id"], fila["id"], cierre.motivo, cierre.resultado, cierre.resumen
            )
            cerradas += 1
        return cerradas

    async def correr(self, intervalo: float = INTERVALO_SEG) -> None:
        """El ciclo. Nunca muere por un error de una tanda."""
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
                        "cola: %d reclamados, %d enviados, %d fallidos, %d vencidos",
                        resultado.reclamados, resultado.enviados,
                        resultado.fallidos, resultado.vencidos,
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
    from anthropic import AsyncAnthropic

    from app.config import settings

    await agenda.conectar()
    cliente = WhatsAppCliente()
    llm = AsyncAnthropic(api_key=settings().anthropic_api_key or None)
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
