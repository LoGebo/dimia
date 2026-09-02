"""Cliente delgado sobre las funciones RPC del motor en Postgres."""
from __future__ import annotations

import asyncio

import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import asyncpg

from app.config import settings


@dataclass(frozen=True, slots=True)
class Slot:
    inicio: datetime
    fin: datetime
    resource_id: uuid.UUID
    resource_nombre: str

    def hablado(self, tz: ZoneInfo) -> str:
        """Como lo dice el agente. Nunca '15:00'."""
        local = self.inicio.astimezone(tz)
        h24, minuto = local.hour, local.minute
        h12 = h24 % 12 or 12
        franja = "de la manana" if h24 < 12 else ("de la tarde" if h24 < 19 else "de la noche")
        if minuto == 0:
            reloj = str(h12)
        elif minuto == 30:
            reloj = f"{h12} y media"
        elif minuto == 15:
            reloj = f"{h12} y cuarto"
        else:
            reloj = f"{h12} {minuto:02d}"
        return f"{reloj} {franja}"


@dataclass(frozen=True, slots=True)
class Tenant:
    id: uuid.UUID
    nombre: str
    vertical: str
    zona_horaria: str
    telefono_escalamiento: str | None
    voz_id: str | None
    tts_proveedor: str = "elevenlabs"
    tts_ajustes: dict | None = None
    instrucciones_extra: str | None = None
    llm_proveedor: str = "openai"
    llm_modelo: str | None = None
    saludo: str | None = None
    prompt_base: str | None = None

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.zona_horaria)


COLUMNAS_TENANT = (
    "id, nombre, vertical, zona_horaria, telefono_escalamiento, voz_id, "
    "tts_proveedor, tts_ajustes, instrucciones_extra, llm_proveedor, llm_modelo, "
    "saludo, prompt_base"
)


def _tenant(fila: asyncpg.Record | None) -> Tenant | None:
    """Una sola lista de columnas para las dos formas de resolver el negocio.

    Cuando divergian, la sala de prueba y la llamada saliente leian un tenant
    sin `prompt_base` y sonaban distinto de la llamada real.
    """
    if not fila:
        return None
    d = dict(fila)
    if isinstance(d.get("tts_ajustes"), str):
        d["tts_ajustes"] = json.loads(d["tts_ajustes"])
    return Tenant(**d)


class Agenda:
    """Un pool por event loop.

    Con el ejecutor de procesos habia un solo loop y bastaba un pool. Con el
    ejecutor de hilos (macOS) cada llamada corre en su propio hilo con su
    propio loop; un pool de asyncpg no puede cruzar loops y truena con
    "another operation is in progress". Se guarda un pool por loop y se crea
    la primera vez que ese loop lo pide.
    """

    def __init__(self) -> None:
        self._pools: dict[int, asyncpg.Pool] = {}

    async def conectar(self) -> None:
        llave = id(asyncio.get_running_loop())
        if llave not in self._pools:
            self._pools[llave] = await asyncpg.create_pool(
                settings().pg_dsn,
                min_size=1,
                max_size=4,
                statement_cache_size=0,
                command_timeout=5,
            )

    def adoptar_pool(self, pool: asyncpg.Pool) -> None:
        self._pools[id(asyncio.get_running_loop())] = pool

    async def cerrar(self) -> None:
        pool = self._pools.pop(id(asyncio.get_running_loop()), None)
        if pool:
            await pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        pool = self._pools.get(id(asyncio.get_running_loop()))
        if pool is None:
            raise RuntimeError("llama conectar() antes")
        return pool


    async def tenant_por_telefono(self, numero: str) -> Tenant | None:
        fila = await self.pool.fetchrow(
            f"""select {COLUMNAS_TENANT}
                  from tenant where activo
                   and id = (select tenant_id from public.tenant_por_numero($1))""",
            numero,
        )
        return _tenant(fila)

    async def plantilla_vertical(self, clave: str) -> dict | None:
        fila = await self.pool.fetchrow(
            """select clave, nombre, instrucciones, saludo, herramientas
               from vertical_template where clave = $1 and activo""",
            clave,
        )
        if not fila:
            return None
        d = dict(fila)
        if isinstance(d["herramientas"], str):
            d["herramientas"] = json.loads(d["herramientas"])
        return d

    async def registrar_recado(
        self, tenant_id: uuid.UUID, telefono: str, asunto: str,
        nombre: str | None = None, detalle: str | None = None,
        campos: dict | None = None, call_id: str | None = None,
    ) -> dict:
        crudo = await self.pool.fetchval(
            "select registrar_recado($1,$2,$3,$4,$5,$6,$7)",
            tenant_id, telefono, asunto, nombre, detalle,
            json.dumps(campos or {}), call_id,
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo

    async def buscar_catalogo(
        self, tenant_id: uuid.UUID, consulta: str | None = None,
        tipo: str | None = None, limite: int = 8,
    ) -> list[dict]:
        filas = await self.pool.fetch(
            "select * from buscar_catalogo($1,$2,$3,$4)",
            tenant_id, consulta, tipo, limite,
        )
        salida = []
        for f in filas:
            d = dict(f)
            if isinstance(d.get("atributos"), str):
                d["atributos"] = json.loads(d["atributos"])
            salida.append(d)
        return salida

    async def buscar_conocimiento(
        self, tenant_id: uuid.UUID, consulta: str, limite: int = 4
    ) -> list[dict]:
        filas = await self.pool.fetch(
            "select * from buscar_conocimiento($1,$2,$3)", tenant_id, consulta, limite
        )
        return [dict(f) for f in filas]

    async def tenant_por_red(self, canal: str, cuenta_id: str) -> Tenant | None:
        """El negocio dueño de una cuenta de Instagram o de una pagina."""
        tenant_id = await self.pool.fetchval(
            "select tenant_por_red($1,$2)", canal, cuenta_id
        )
        return await self.tenant_por_id(tenant_id) if tenant_id else None

    async def encolar_recordatorios(self, ventana_horas: int = 24) -> int:
        """Encola el recordatorio de las citas que caen dentro de la ventana."""
        return await self.pool.fetchval(
            "select encolar_recordatorios($1)", ventana_horas
        ) or 0

    async def outbox_reclamar(self, limite: int = 25) -> list[dict]:
        """Toma las filas que toca mandar y las marca como intentadas.

        El respaldo exponencial se aplica al reclamar, no al fallar: si el
        proceso muere a medio envio, la fila reaparece sola cuando vence su
        ventana en vez de quedarse trabada.
        """
        filas = await self.pool.fetch("select * from outbox_reclamar($1)", limite)
        salida = []
        for f in filas:
            d = dict(f)
            if isinstance(d.get("payload"), str):
                d["payload"] = json.loads(d["payload"])
            salida.append(d)
        return salida

    async def outbox_marcar_enviado(self, outbox_id: uuid.UUID) -> None:
        await self.pool.execute("select outbox_marcar_enviado($1)", outbox_id)

    async def outbox_marcar_error(self, outbox_id: uuid.UUID, error: str) -> None:
        await self.pool.execute("select outbox_marcar_error($1,$2)", outbox_id, error)

    async def outbox_marcar_vencido(self, outbox_id: uuid.UUID, motivo: str) -> None:
        """Se da por perdido de una vez: reintentarlo solo lo encuentra mas viejo."""
        await self.pool.execute("select outbox_marcar_vencido($1,$2)", outbox_id, motivo)

    async def mensaje_registrar(
        self,
        tenant_id: uuid.UUID,
        canal: str,
        contacto: str,
        autor: str,
        texto: str,
        nombre: str | None = None,
        herramienta: str | None = None,
        externo_id: str | None = None,
        call_id: str | None = None,
    ) -> uuid.UUID | None:
        """Deja escrito un turno de conversacion.

        Nunca debe tumbar la conversacion en vivo: si la escritura falla, el
        cliente igual tiene que recibir su respuesta. Por eso el que llama la
        ejecuta sin esperar y los errores se registran, no se propagan.
        """
        return await self.pool.fetchval(
            "select mensaje_registrar($1,$2::canal_conversacion,$3,$4::autor_mensaje,$5,$6,$7,$8,$9)",
            tenant_id, canal, contacto, autor, texto,
            nombre, herramienta, externo_id, call_id,
        )

    async def conversacion_escalar(
        self, tenant_id: uuid.UUID, conversacion_id: uuid.UUID, motivo: str
    ) -> None:
        await self.pool.execute(
            "select conversacion_escalar($1,$2,$3)", tenant_id, conversacion_id, motivo
        )

    async def llamada_cerrar(
        self, tenant_id: uuid.UUID, call_id: str, motivo: str, resultado: str, resumen: str
    ) -> None:
        await self.pool.execute(
            """select public.contacto_cerrar($1, 'call_log', c.id, $3, $4::resultado_contacto, $5)
                 from call_log c where c.tenant_id = $1 and c.call_id = $2""",
            tenant_id, call_id, motivo, resultado, resumen,
        )

    async def conversacion_cerrar(
        self, tenant_id: uuid.UUID, conversacion_id: uuid.UUID,
        motivo: str, resultado: str, resumen: str,
    ) -> None:
        await self.pool.execute(
            "select public.contacto_cerrar($1, 'conversacion', $2, $3, $4::resultado_contacto, $5)",
            tenant_id, conversacion_id, motivo, resultado, resumen,
        )

    async def origen_por_numero(self, numero: str) -> str | None:
        """La etiqueta de la linea marcada, si el numero es de una campaña."""
        return await self.pool.fetchval(
            "select origen from public.tenant_por_numero($1)", numero
        )

    async def cliente_atribuir(self, tenant_id: uuid.UUID, telefono: str, origen: str) -> None:
        await self.pool.execute("select public.cliente_atribuir($1, $2, $3)", tenant_id, telefono, origen)

    async def resena_esperando(self, tenant_id: uuid.UUID, telefono: str) -> bool:
        """Si lo ultimo que le llego a esta persona fue la pregunta de reseña.

        La pregunta sale por el outbox y no queda en `mensaje`, asi que se
        compara contra el hilo: si despues de enviarla hubo cualquier turno,
        la persona ya esta hablando de otra cosa y un "2" no es calificacion.
        """
        return await self.pool.fetchval(
            """select exists (
                 select 1 from outbox o
                  where o.tenant_id = $1 and o.plantilla = 'resena' and o.estado = 'enviado'
                    and o.destino = public.telefono_normalizado($2)
                    and o.enviado >= now() - interval '3 days'
                    and not exists (select 1 from resena r where r.booking_id = o.booking_id)
                    and not exists (
                      select 1 from mensaje m
                        join conversacion c on c.id = m.conversacion_id
                       where c.tenant_id = $1 and c.canal = 'whatsapp'
                         and c.contacto in ($2, public.telefono_normalizado($2))
                         and m.creado > o.enviado))""",
            tenant_id, telefono,
        ) or False

    async def resena_responder(self, tenant_id: uuid.UUID, telefono: str, texto: str) -> dict:
        crudo = await self.pool.fetchval("select public.resena_responder($1, $2, $3)", tenant_id, telefono, texto)
        return json.loads(crudo) if isinstance(crudo, str) else dict(crudo or {})

    async def campana_encolar(self, limite: int = 50) -> int:
        return await self.pool.fetchval("select public.campana_encolar($1)", limite) or 0

    async def campana_cerrar_terminadas(self) -> int:
        return await self.pool.fetchval("select public.campana_cerrar_terminadas()") or 0

    async def campana_contacto_resultado(
        self, contacto_id: uuid.UUID, estado: str, resultado: str | None = None,
        call_id: str | None = None,
    ) -> None:
        await self.pool.execute(
            "select public.campana_contacto_resultado($1, $2::contacto_estado, $3, $4)",
            contacto_id, estado, resultado, call_id,
        )

    async def conversaciones_por_resumir(self, inactiva_min: int = 120, limite: int = 20) -> list[dict]:
        filas = await self.pool.fetch(
            "select id, tenant_id, canal from public.conversaciones_por_resumir($1, $2)",
            inactiva_min, limite,
        )
        return [dict(f) for f in filas]

    async def turnos_de_conversacion(self, conversacion_id: uuid.UUID, limite: int = 80) -> list[dict]:
        filas = await self.pool.fetch(
            """select autor::text as autor, texto from mensaje
                where conversacion_id = $1 order by creado limit $2""",
            conversacion_id, limite,
        )
        return [dict(f) for f in filas]

    async def catalogo_resumen(
        self, tenant_id: uuid.UUID, limite: int = 80
    ) -> list[dict]:
        """Lo que hay en el menu, para inyectarlo en el prompt.

        Sin esto el modelo contesta "no tenemos eso" de memoria antes de
        buscarlo, y solo consulta si el cliente insiste. Con el menu a la vista
        tambien se ahorra un viaje al modelo por cada pregunta de precio.

        `alias` puede llegar como texto JSON; sin decodificarlo se deletrea
        letra por letra.
        """
        filas = await self.pool.fetch(
            """select nombre, tipo, precio, alias
               from catalogo_item
               where tenant_id = $1 and disponible
               order by tipo, nombre
               limit $2""",
            tenant_id, limite,
        )
        salida = []
        for f in filas:
            d = dict(f)
            if isinstance(d.get("alias"), str):
                d["alias"] = json.loads(d["alias"])
            salida.append(d)
        return salida

    async def catalogo_cuantos(self, tenant_id: uuid.UUID) -> int:
        return await self.pool.fetchval(
            "select count(*) from catalogo_item where tenant_id=$1 and disponible",
            tenant_id,
        )

    async def tipos_de_catalogo(self, tenant_id: uuid.UUID) -> list[str]:
        filas = await self.pool.fetch(
            "select distinct tipo from catalogo_item where tenant_id=$1 and disponible order by tipo",
            tenant_id,
        )
        return [f["tipo"] for f in filas]

    async def pedido_abrir(
        self, tenant_id: uuid.UUID, telefono: str, call_id: str | None = None
    ) -> uuid.UUID:
        return await self.pool.fetchval(
            "select pedido_abrir($1,$2,$3)", tenant_id, telefono, call_id
        )

    async def pedido_agregar(
        self, tenant_id: uuid.UUID, pedido_id: uuid.UUID, catalogo_id: uuid.UUID,
        cantidad: int = 1, notas: str | None = None,
    ) -> dict:
        crudo = await self.pool.fetchval(
            "select pedido_agregar($1,$2,$3,$4,$5)",
            tenant_id, pedido_id, catalogo_id, cantidad, notas,
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo

    async def pedido_quitar(
        self, tenant_id: uuid.UUID, pedido_id: uuid.UUID, nombre: str
    ) -> dict:
        crudo = await self.pool.fetchval(
            "select pedido_quitar($1,$2,$3)", tenant_id, pedido_id, nombre
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo

    async def pedido_resumen(self, tenant_id: uuid.UUID, pedido_id: uuid.UUID) -> dict:
        crudo = await self.pool.fetchval(
            "select pedido_resumen($1,$2)", tenant_id, pedido_id
        )
        return json.loads(crudo) if isinstance(crudo, str) else (crudo or {})

    async def pedido_confirmar(
        self, tenant_id: uuid.UUID, pedido_id: uuid.UUID, nombre: str,
        tipo: str = "recoger", direccion: str | None = None, minutos: int = 30,
    ) -> dict:
        crudo = await self.pool.fetchval(
            "select pedido_confirmar($1,$2,$3,$4,$5,$6)",
            tenant_id, pedido_id, nombre, tipo, direccion, minutos,
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo

    async def tenant_por_id(self, tenant_id: uuid.UUID) -> Tenant | None:
        fila = await self.pool.fetchrow(
            f"select {COLUMNAS_TENANT} from tenant where id = $1 and activo",
            tenant_id,
        )
        return _tenant(fila)

    async def horario_semanal(self, tenant_id: uuid.UUID) -> list[dict]:
        filas = await self.pool.fetch(
            """select tipo::text, dia_semana, fecha, hora_inicio, hora_fin
               from schedule_rule
               where tenant_id = $1 and resource_id is null and dia_semana is not null
               order by dia_semana, hora_inicio""",
            tenant_id,
        )
        return [dict(f) for f in filas]

    async def terminos_del_negocio(self, tenant_id: uuid.UUID, limite: int = 90) -> list[str]:
        filas = await self.pool.fetch(
            """select nombre, alias from catalogo_item
               where tenant_id = $1 and disponible
               union all
               select nombre, alias from service
               where tenant_id = $1 and activo
               union all
               select nombre, '[]'::jsonb from resource
               where tenant_id = $1 and activo""",
            tenant_id,
        )
        terminos: list[str] = []
        for f in filas:
            terminos.append(f["nombre"])
            crudo = f["alias"]
            if isinstance(crudo, str):
                crudo = json.loads(crudo)
            terminos.extend(str(a) for a in (crudo or []))
        vistos: set[str] = set()
        unicos = []
        for termino in terminos:
            clave = termino.strip().lower()
            if clave and clave not in vistos and len(clave) > 2:
                vistos.add(clave)
                unicos.append(termino.strip())
        return unicos[:limite]

    async def servicios(self, tenant_id: uuid.UUID) -> list[dict]:
        filas = await self.pool.fetch(
            """select id, nombre, alias, duracion_min, precio
               from service where tenant_id = $1 and activo order by nombre""",
            tenant_id,
        )
        return [
            {**dict(f), "alias": json.loads(f["alias"]) if isinstance(f["alias"], str) else f["alias"]}
            for f in filas
        ]

    async def faq(self, tenant_id: uuid.UUID, limite: int = 30) -> list[dict]:
        filas = await self.pool.fetch(
            """select pregunta, respuesta from knowledge
               where tenant_id = $1 order by prioridad desc limit $2""",
            tenant_id, limite,
        )
        return [dict(f) for f in filas]


    async def slots_libres(
        self, tenant_id: uuid.UUID, servicio_id: uuid.UUID,
        dia: date, personas: int = 1, limite: int = 12,
        desde_hora: time | None = None, hasta_hora: time | None = None,
    ) -> list[Slot]:
        filas = await self.pool.fetch(
            "select * from slots_libres($1,$2,$3,$4,$5,$6,$7)",
            tenant_id, servicio_id, dia, personas, limite, desde_hora, hasta_hora,
        )
        return [
            Slot(f["inicio"], f["fin"], f["resource_id"], f["resource_nombre"])
            for f in filas
        ]

    async def reservar(
        self, tenant_id: uuid.UUID, servicio_id: uuid.UUID, recurso_id: uuid.UUID,
        inicio: datetime, nombre: str, telefono: str,
        personas: int = 1, notas: str | None = None, call_id: str | None = None,
    ) -> dict:
        crudo = await self.pool.fetchval(
            "select reservar($1,$2,$3,$4,$5,$6,$7,$8,$9)",
            tenant_id, servicio_id, recurso_id, inicio,
            nombre, telefono, personas, notas, call_id,
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo

    async def buscar_reserva(
        self, tenant_id: uuid.UUID, telefono: str | None = None,
        codigo: str | None = None, nombre: str | None = None,
    ) -> list[dict]:
        filas = await self.pool.fetch(
            "select * from buscar_reserva($1,$2,$3,$4)",
            tenant_id, telefono, codigo, nombre,
        )
        return [dict(f) for f in filas]

    async def cancelar(self, tenant_id: uuid.UUID, booking_id: uuid.UUID) -> dict:
        crudo = await self.pool.fetchval(
            "select cancelar_reserva($1,$2)", tenant_id, booking_id
        )
        return json.loads(crudo) if isinstance(crudo, str) else crudo


    async def registrar_llamada(
        self, tenant_id: uuid.UUID, call_id: str, telefono: str | None,
        duracion_seg: int, resuelto: bool, escalado: bool,
        motivo: str | None = None, booking_id: uuid.UUID | None = None,
        transcripcion: list | None = None, latencias: dict | None = None,
    ) -> None:
        await self.pool.execute(
            """insert into call_log (tenant_id, call_id, telefono, duracion_seg,
                                     resuelto, escalado, motivo_escalamiento,
                                     booking_id, transcripcion, latencias)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
               on conflict (tenant_id, call_id) do nothing""",
            tenant_id, call_id, telefono, duracion_seg, resuelto, escalado,
            motivo, booking_id,
            json.dumps(transcripcion or []), json.dumps(latencias or {}),
        )


agenda = Agenda()
