"""Cliente delgado sobre las funciones RPC del motor en Postgres."""
from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from contextvars import ContextVar
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


# El negocio de la tarea en curso. Con roles sin BYPASSRLS (app_voz,
# app_texto, app_cron) cada consulta corre en una transaccion con
# `app.tenant` fijado; sin negocio fijado la base truena en vez de devolver
# datos de otro. Se fija al resolver el negocio (tenant_por_*) y las tareas
# hijas lo heredan (asyncio copia el contexto al crearlas).
negocio_en_curso: ContextVar[uuid.UUID | None] = ContextVar("negocio_en_curso", default=None)


def fijar_negocio(tenant_id: uuid.UUID | str) -> None:
    negocio_en_curso.set(uuid.UUID(str(tenant_id)))


@contextmanager
def en_negocio(tenant_id: uuid.UUID | str) -> Iterator[None]:
    """Para el despachador: un tramo de trabajo sobre un negocio y de vuelta."""
    ficha = negocio_en_curso.set(uuid.UUID(str(tenant_id)))
    try:
        yield
    finally:
        negocio_en_curso.reset(ficha)


class _PoolDelNegocio:
    """El pool de asyncpg, pero con `app.tenant` fijado en cada consulta.

    set_config(..., true) vive lo que la transaccion: con el pooler de
    Supabase en modo transaccion, un SET de sesion se filtraria a otra
    conexion. Sin negocio fijado la consulta sale tal cual (lo global:
    numero -> negocio, la cola del despachador).
    """

    # BEGIN y set_config van en un solo viaje: 2 extra por consulta (el de
    # BEGIN+set_config y el COMMIT) en vez de 3. Sin parametros para que salga
    # como consulta simple, que acepta varias sentencias; el tenant pasa por
    # uuid.UUID antes de entrar al texto, asi que no hay nada que inyectar.
    # ponytail: con Fly en dfw y la base en us-east-1 son ~2 RTT por consulta;
    # medir el p95 por turno antes de pasar la voz a app_voz y, si pesa,
    # mover slots_libres y reservar a funciones que fijen app.tenant por dentro.

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    def __getattr__(self, nombre: str):
        return getattr(self._pool, nombre)

    async def _correr(self, metodo: str, sql: str, *args, **kwargs):
        tenant = negocio_en_curso.get()
        if tenant is None:
            return await getattr(self._pool, metodo)(sql, *args, **kwargs)
        tenant = uuid.UUID(str(tenant))
        async with self._pool.acquire() as con:
            await con.execute(f"begin; select set_config('app.tenant', '{tenant}', true)")
            try:
                resultado = await getattr(con, metodo)(sql, *args, **kwargs)
            except Exception:
                # Sin tapar el error original. Si la conexion ya no sirve, el
                # pool la descarta; si se cancela aqui, su reset hace el ROLLBACK.
                with suppress(Exception):
                    await con.execute("rollback")
                raise
            await con.execute("commit")
            return resultado

    async def fetch(self, sql: str, *args, **kwargs):
        return await self._correr("fetch", sql, *args, **kwargs)

    async def fetchrow(self, sql: str, *args, **kwargs):
        return await self._correr("fetchrow", sql, *args, **kwargs)

    async def fetchval(self, sql: str, *args, **kwargs):
        return await self._correr("fetchval", sql, *args, **kwargs)

    async def execute(self, sql: str, *args, **kwargs):
        return await self._correr("execute", sql, *args, **kwargs)


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

    async def conectar(self, dsn: str | None = None) -> None:
        llave = id(asyncio.get_running_loop())
        if llave not in self._pools:
            cfg = settings()
            self._pools[llave] = await asyncpg.create_pool(
                dsn or cfg.pg_dsn,
                min_size=cfg.pg_pool_min,
                max_size=cfg.pg_pool_max,
                statement_cache_size=0,
                command_timeout=5,
                # Conectar tardaba 60 s (el default) con la base en un agujero
                # negro: la llamada entraba y nadie contestaba ese minuto.
                timeout=5,
            )

    def adoptar_pool(self, pool: asyncpg.Pool) -> None:
        self._pools[id(asyncio.get_running_loop())] = pool

    async def cerrar(self) -> None:
        pool = self._pools.pop(id(asyncio.get_running_loop()), None)
        if pool:
            await pool.close()

    @property
    def pool(self) -> _PoolDelNegocio:
        pool = self._pools.get(id(asyncio.get_running_loop()))
        if pool is None:
            raise RuntimeError("llama conectar() antes")
        return _PoolDelNegocio(pool)


    async def tenant_por_telefono(self, numero: str) -> Tenant | None:
        """Resuelve el negocio del numero marcado y lo deja fijado para la tarea."""
        tenant_id = await self.pool.fetchval(
            "select tenant_id from public.tenant_por_numero($1)", numero
        )
        return await self.tenant_por_id(tenant_id) if tenant_id else None

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

    async def outbox_marcar_enviado(self, outbox_id: uuid.UUID, externo_id: str | None = None) -> None:
        await self.pool.execute("select outbox_marcar_enviado($1)", outbox_id)
        if externo_id:
            await self.pool.execute("update outbox set externo_id = $2 where id = $1", outbox_id, externo_id)

    async def outbox_entrega(self, externo_id: str, estado: str, error: str | None) -> None:
        """Estado de entrega que reporta Meta (sent → delivered → read, o failed)."""
        # Llega por wamid, sin negocio: la funcion cruza negocios solo para esto.
        await self.pool.execute(
            "select outbox_entrega_registrar($1, $2, $3)", externo_id, estado, error
        )

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

    async def mensaje_reclamar(self, canal: str, externo_id: str) -> bool:
        """Apunta el wamid/mid antes de atenderlo. False si ya se habia recibido:
        Meta reintenta el webhook y el segundo no debe despertar al modelo."""
        return bool(await self.pool.fetchval(
            "insert into mensaje_entrante (canal, externo_id) values ($1, $2) "
            "on conflict do nothing returning true",
            canal, externo_id,
        ))

    async def mensaje_respondido(self, canal: str, externo_id: str) -> None:
        """La respuesta salió o quedó en la cola: el vigilante deja de contarlo."""
        await self.pool.execute(
            "update mensaje_entrante set respondido = now() "
            "where canal = $1 and externo_id = $2 and respondido is null",
            canal, externo_id,
        )

    async def latido(self, componente: str) -> None:
        """Anota que el proceso sigue vivo (salud_operacion lo lee)."""
        await self.pool.execute("select latido_registrar($1)", componente)

    async def outbox_respuesta(
        self, tenant_id: uuid.UUID, canal: str, destino: str, texto: str
    ) -> None:
        """La respuesta que Meta no acepto al momento: la cola la reintenta."""
        await self.pool.execute(
            "insert into outbox (tenant_id, canal, destino, plantilla, payload) "
            "values ($1, $2, $3, 'campana', jsonb_build_object('origen', 'respuesta', 'mensaje', $4::text))",
            tenant_id, canal, destino, texto,
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

    async def confirmacion_pendiente(
        self, tenant_id: uuid.UUID, telefono: str, booking_id: uuid.UUID | None = None,
        escrita: bool = False,
    ) -> dict | None:
        """La cita que se le pregunto y no ha contestado; None si no hay.

        `escrita`: la respuesta no vino del boton; solo cuenta si no se hablo de
        otra cosa despues de la pregunta.
        """
        crudo = await self.pool.fetchval(
            "select public.confirmacion_pendiente($1, $2, $3, $4)", tenant_id, telefono, booking_id, escrita
        )
        if crudo is None:
            return None
        return json.loads(crudo) if isinstance(crudo, str) else dict(crudo)

    async def booking_confirmar_cliente(self, tenant_id: uuid.UUID, booking_id: uuid.UUID) -> dict:
        crudo = await self.pool.fetchval(
            "select public.booking_confirmar_cliente($1, $2)", tenant_id, booking_id
        )
        return json.loads(crudo) if isinstance(crudo, str) else dict(crudo or {})

    async def cancelar_reserva_por_cliente(self, tenant_id: uuid.UUID, booking_id: uuid.UUID) -> dict:
        crudo = await self.pool.fetchval(
            "select public.cancelar_reserva_por_cliente($1, $2)", tenant_id, booking_id
        )
        return json.loads(crudo) if isinstance(crudo, str) else dict(crudo or {})

    async def cancelar_sin_confirmar(self, horas: int = 2) -> int:
        return await self.pool.fetchval("select public.cancelar_sin_confirmar($1)", horas) or 0

    async def resena_responder(self, tenant_id: uuid.UUID, telefono: str, texto: str) -> dict:
        crudo = await self.pool.fetchval("select public.resena_responder($1, $2, $3)", tenant_id, telefono, texto)
        return json.loads(crudo) if isinstance(crudo, str) else dict(crudo or {})

    async def campana_encolar(self, limite: int = 50) -> int:
        return await self.pool.fetchval("select public.campana_encolar($1)", limite) or 0

    async def campana_pausar_llamadas(self) -> int:
        """Sin troncal de salida no se puede marcar: las campañas por llamada se pausan."""
        return int((await self.pool.execute(
            "update campana set estado = 'pausada', actualizado = now() "
            "where canal = 'llamada' and estado = 'activa'"
        )).split()[-1])

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
        """Lee el negocio y lo deja fijado para el resto de la tarea."""
        fijar_negocio(tenant_id)
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

    async def wa_reglas(self, tenant_id: uuid.UUID) -> list[dict]:
        """Las reglas deterministas de WhatsApp del negocio, en orden."""
        filas = await self.pool.fetch(
            """select tipo, disparador, respuesta from wa_regla
               where tenant_id = $1 and activo order by orden, creado""",
            tenant_id,
        )
        return [dict(f) for f in filas]

    async def conversacion_abierta(
        self, tenant_id: uuid.UUID, canal: str, contacto: str
    ) -> bool:
        return bool(await self.pool.fetchval(
            "select conversacion_abierta($1, $2::canal_conversacion, $3)",
            tenant_id, canal, contacto,
        ))

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
        duracion_seg: int | None, resuelto: bool, escalado: bool,
        motivo: str | None = None, booking_id: uuid.UUID | None = None,
        transcripcion: list | None = None, latencias: dict | None = None,
        fin_motivo: str | None = None,
    ) -> None:
        """Al contestar se inserta con fin_motivo 'en_curso'; al colgar se completa."""
        await self.pool.execute(
            """insert into call_log (tenant_id, call_id, telefono, duracion_seg,
                                     resuelto, escalado, motivo_escalamiento,
                                     booking_id, transcripcion, latencias, fin_motivo)
               values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
               on conflict (tenant_id, call_id) do update set
                 duracion_seg = excluded.duracion_seg, resuelto = excluded.resuelto,
                 escalado = excluded.escalado,
                 motivo_escalamiento = excluded.motivo_escalamiento,
                 booking_id = excluded.booking_id, transcripcion = excluded.transcripcion,
                 latencias = excluded.latencias, fin_motivo = excluded.fin_motivo""",
            tenant_id, call_id, telefono, duracion_seg, resuelto, escalado,
            motivo, booking_id,
            json.dumps(transcripcion or []), json.dumps(latencias or {}), fin_motivo,
        )

    async def sesion_tomar(
        self, tenant_id: uuid.UUID, canal: str, contacto: str, version: int,
        dueno: uuid.UUID, ttl_seg: int, candado_seg: int,
    ) -> dict:
        """{'tomada', 'version', 'estado'}; estado None si la version no cambio."""
        fila = await self.pool.fetchrow(
            "select * from sesion_tomar($1,$2,$3,$4,$5,$6,$7)",
            tenant_id, canal, contacto, version, dueno, ttl_seg, candado_seg,
        )
        d = dict(fila)
        if isinstance(d["estado"], str):
            d["estado"] = json.loads(d["estado"])
        return d

    async def sesion_guardar(
        self, tenant_id: uuid.UUID, canal: str, contacto: str, dueno: uuid.UUID, estado: dict
    ) -> int | None:
        return await self.pool.fetchval(
            "select sesion_guardar($1,$2,$3,$4,$5)",
            tenant_id, canal, contacto, dueno, json.dumps(estado),
        )

    async def anclaje_registrar(
        self, call_session_id: str, call_control_id: str, numero_negocio: str,
        llamante: str | None, tenant_id: uuid.UUID | None, destino_respaldo: str | None,
    ) -> bool:
        """False si la llamada ya estaba registrada (Telnyx reintento el webhook)."""
        return bool(await self.pool.fetchval(
            """insert into llamada_anclaje (call_session_id, call_control_id, numero_negocio,
                                            llamante, tenant_id, destino_respaldo)
               values ($1,$2,$3,$4,$5,$6) on conflict do nothing returning true""",
            call_session_id, call_control_id, numero_negocio, llamante, tenant_id, destino_respaldo,
        ))

    async def anclaje(self, call_session_id: str) -> dict | None:
        fila = await self.pool.fetchrow(
            "select * from llamada_anclaje where call_session_id = $1", call_session_id
        )
        return dict(fila) if fila else None

    async def anclaje_resolver(self, call_session_id: str, estado: str) -> dict | None:
        fila = await self.pool.fetchrow(
            "select * from anclaje_resolver($1,$2)", call_session_id, estado
        )
        return dict(fila) if fila else None

    async def anclaje_reabrir(self, call_session_id: str) -> None:
        """El desvío no salió: la llamada vuelve a 'timbrando' para que el
        siguiente intento (reintento de Telnyx o del temporizador) lo repita."""
        await self.pool.execute(
            """update llamada_anclaje set estado = 'timbrando', actualizada = now()
                where call_session_id = $1 and estado = 'desviada'""",
            call_session_id,
        )

    async def base_viva(self, tope_seg: float = 2.0) -> bool:
        """Para /salud: un select 1 con tope corto, sin tronar si la base no contesta."""
        try:
            return await asyncio.wait_for(self.pool.fetchval("select 1"), tope_seg) == 1
        except Exception:
            return False


agenda = Agenda()
