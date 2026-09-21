"""Dimia como integración: las herramientas del negocio (citas, clientes,
cobros, servicios) para los agentes, por MCP. Cada agente entra con su propio
token y solo ve su negocio. Solo lectura por ahora."""
from datetime import date, datetime, timedelta

from mcp.server.mcpserver import Context, MCPServer
from mcp_types import ToolAnnotations
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError

from agentes import db

SOLO_LECTURA = ToolAnnotations(readOnlyHint=True)
servidor = MCPServer("dimia", instructions="Datos reales del negocio del dueño: citas, clientes, cobros y servicios. Úselos antes de suponer. Las herramientas que escriben (agendar, cancelar, anotar, registrar pago) piden la aprobación del dueño: antes de llamarlas, diga en el hilo exactamente qué va a hacer.")


async def _tenant(ctx: Context) -> str:
    token = (ctx.headers or {}).get("authorization", "").removeprefix("Bearer ").strip()
    f = await db.uno("select tenant_id from agente where mcp_token = $1 and mcp_token is not null", token) if token else None
    if not f:
        raise MCPError("Token de agente inválido")
    return str(f["tenant_id"])


def _dia(texto: str | None) -> date:
    if not texto or texto == "hoy":
        return date.today()
    if texto == "mañana":
        return date.today() + timedelta(days=1)
    return date.fromisoformat(texto)


@servidor.tool(annotations=SOLO_LECTURA, name="citas", description="Citas del negocio en un día. dia: 'hoy', 'mañana' o AAAA-MM-DD.")
async def citas(ctx: Context, dia: str = "hoy") -> str:
    t = await _tenant(ctx)
    filas = await db.todos(
        """select b.inicio at time zone t.zona_horaria as inicio, b.cliente_nombre, b.telefono, s.nombre as servicio, b.estado, b.confirmado_por_cliente is not null as confirmada
             from booking b join tenant t on t.id = b.tenant_id left join service s on s.id = b.service_id
            where b.tenant_id = $1 and (b.inicio at time zone t.zona_horaria)::date = $2 and b.estado <> 'cancelada'
            order by b.inicio""", t, _dia(dia))
    if not filas:
        return "Sin citas ese día."
    return "\n".join(f"{f['inicio']:%H:%M} · {f['cliente_nombre'] or 'sin nombre'} · {f['servicio'] or ''} · {f['estado']}{' · confirmó' if f['confirmada'] else ''} · {f['telefono'] or ''}" for f in filas)


@servidor.tool(annotations=SOLO_LECTURA, name="buscar_cliente", description="Busca clientes por nombre o teléfono; da citas, faltas y lo gastado.")
async def buscar_cliente(ctx: Context, texto: str) -> str:
    t = await _tenant(ctx)
    filas = await db.todos(
        """select c.nombre, c.telefono, c.correo, c.ultimo_contacto,
                  (select count(*) from booking b where b.cliente_id = c.id and b.estado in ('confirmada','completada')) as citas,
                  (select count(*) from booking b where b.cliente_id = c.id and b.estado = 'no_asistio') as faltas,
                  coalesce((select sum(g.monto) from pago g where g.cliente_id = c.id and g.estado = 'pagado'), 0) as gastado
             from cliente c where c.tenant_id = $1 and (c.nombre ilike '%' || $2 || '%' or c.telefono like '%' || $2 || '%')
            order by c.ultimo_contacto desc nulls last limit 10""", t, texto.strip())
    if not filas:
        return "No hay clientes con ese dato."
    return "\n".join(f"{f['nombre']} · {f['telefono'] or ''} · {f['citas']} citas · {f['faltas']} faltas · ${f['gastado']:,.0f} · último contacto {f['ultimo_contacto']:%Y-%m-%d}" if f['ultimo_contacto'] else f"{f['nombre']} · {f['telefono'] or ''}" for f in filas)


@servidor.tool(annotations=SOLO_LECTURA, name="clientes_sin_volver", description="Clientes que ya vinieron y no han vuelto en N días (default 90).")
async def clientes_sin_volver(ctx: Context, dias: int = 90) -> str:
    t = await _tenant(ctx)
    filas = await db.todos(
        """select c.nombre, c.telefono, c.ultimo_contacto from cliente c
            where c.tenant_id = $1 and c.ultimo_contacto < now() - make_interval(days => $2)
              and exists (select 1 from booking b where b.cliente_id = c.id and b.estado = 'completada')
            order by c.ultimo_contacto limit 30""", t, dias)
    return "\n".join(f"{f['nombre']} · {f['telefono'] or ''} · {f['ultimo_contacto']:%Y-%m-%d}" for f in filas) or "Nadie lleva tanto sin volver."


@servidor.tool(annotations=SOLO_LECTURA, name="cobros", description="Pagos pendientes y lo cobrado en los últimos N días (default 7).")
async def cobros(ctx: Context, dias: int = 7) -> str:
    t = await _tenant(ctx)
    pend = await db.todos("select c.nombre, g.concepto, g.monto, g.creado from pago g left join cliente c on c.id = g.cliente_id where g.tenant_id = $1 and g.estado = 'pendiente' order by g.creado desc limit 30", t)
    tot = await db.uno("select coalesce(sum(monto), 0) as total, count(*) as n from pago where tenant_id = $1 and estado = 'pagado' and coalesce(pagado_en, creado) >= now() - make_interval(days => $2)", t, dias)
    lineas = [f"Cobrado en {dias} días: ${tot['total']:,.0f} en {tot['n']} pagos."]
    lineas += [f"Pendiente: {p['nombre'] or 'sin cliente'} · {p['concepto'] or ''} · ${p['monto']:,.0f} · {p['creado']:%Y-%m-%d}" for p in pend] or ["Sin pagos pendientes."]
    return "\n".join(lineas)


@servidor.tool(annotations=SOLO_LECTURA, name="servicios", description="Servicios activos del negocio con duración y precio.")
async def servicios(ctx: Context) -> str:
    t = await _tenant(ctx)
    filas = await db.todos("select nombre, duracion_min, precio from service where tenant_id = $1 and activo order by nombre", t)
    return "\n".join(f"{f['nombre']} · {f['duracion_min']} min · ${f['precio'] or 0:,.0f}" for f in filas) or "Sin servicios dados de alta."


def app():
    """ASGI para montar en /mcp. Sin estado: cada llamada trae su token."""
    return servidor.streamable_http_app(
        streamable_http_path="/", stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))


# --- Escritura en la agenda del negocio (mismas funciones que usa el motor de voz;
# --- la garantía de no traslape vive en la base) -------------------------------

async def _servicio(t: str, nombre: str):
    f = await db.uno("select id, nombre, duracion_min from service where tenant_id = $1 and activo and (nombre ilike $2 or alias::text ilike '%' || $2 || '%') order by nombre limit 1", t, nombre.strip()) \
        or await db.uno("select id, nombre, duracion_min from service where tenant_id = $1 and activo and nombre ilike '%' || $2 || '%' order by nombre limit 1", t, nombre.strip())
    return f


@servidor.tool(annotations=SOLO_LECTURA, name="disponibilidad", description="Horarios libres de un servicio en un día (AAAA-MM-DD, 'hoy' o 'mañana'). Devuelve inicio ISO y recurso; úselo antes de agendar.")
async def disponibilidad(ctx: Context, servicio: str, dia: str = "hoy", personas: int = 1) -> str:
    t = await _tenant(ctx)
    s = await _servicio(t, servicio)
    if not s:
        return "Ese servicio no existe; consulte `servicios`."
    filas = await db.todos("select inicio, fin, resource_nombre from slots_libres($1, $2, $3, $4, 40, null, null)", t, s["id"], _dia(dia), personas)
    z = (await db.uno("select zona_horaria from tenant where id = $1", t))["zona_horaria"]
    if not filas:
        return "Sin lugar ese día."
    from zoneinfo import ZoneInfo
    return "\n".join(f"{f['inicio'].astimezone(ZoneInfo(z)).isoformat()} · {f['resource_nombre']}" for f in filas)


@servidor.tool(name="agendar_cita", description="Agenda una cita: servicio, inicio ISO (de `disponibilidad`), nombre y teléfono del cliente. Pide aprobación del dueño.")
async def agendar_cita(ctx: Context, servicio: str, inicio: str, cliente_nombre: str, telefono: str, personas: int = 1, notas: str = "") -> str:
    t = await _tenant(ctx)
    s = await _servicio(t, servicio)
    if not s:
        return "Ese servicio no existe."
    cuando = datetime.fromisoformat(inicio)
    slot = await db.uno("select resource_id from slots_libres($1, $2, $3, $4, 200, null, null) where inicio = $5 limit 1", t, s["id"], cuando.date(), personas, cuando)
    if not slot:
        return "Ese horario ya no está libre; consulte `disponibilidad` otra vez."
    r = await db.uno("select reservar($1, $2, $3, $4, $5, $6, $7, $8, null) as r", t, s["id"], slot["resource_id"], cuando, cliente_nombre.strip(), "".join(c for c in telefono if c.isdigit()), personas, notas or None)
    d = r["r"] if isinstance(r["r"], dict) else __import__("json").loads(r["r"])
    return f"Cita agendada. Código {d.get('codigo')} · {cliente_nombre} · {s['nombre']} · {cuando:%Y-%m-%d %H:%M}." if d.get("ok", True) and not d.get("error") else f"No se pudo agendar: {d.get('error') or d}"


@servidor.tool(annotations=SOLO_LECTURA, name="buscar_cita", description="Busca citas por teléfono, código o nombre del cliente.")
async def buscar_cita(ctx: Context, telefono: str = "", codigo: str = "", nombre: str = "") -> str:
    t = await _tenant(ctx)
    filas = await db.todos("select * from buscar_reserva($1, $2, $3, $4)", t, telefono or None, codigo or None, nombre or None)
    return "\n".join(f"{f.get('booking_id') or f.get('id')} · {f.get('inicio')} · {f.get('cliente_nombre') or f.get('nombre', '')} · {f.get('servicio') or ''} · {f.get('estado', '')} · código {f.get('codigo', '')}" for f in filas) or "Sin citas con ese dato."


@servidor.tool(name="cancelar_cita", description="Cancela una cita por su id (de `buscar_cita` o `citas`). Pide aprobación del dueño.")
async def cancelar_cita(ctx: Context, booking_id: str) -> str:
    t = await _tenant(ctx)
    import uuid as _uuid
    r = await db.uno("select cancelar_reserva($1, $2) as r", t, _uuid.UUID(booking_id))
    d = r["r"] if isinstance(r["r"], dict) else __import__("json").loads(r["r"])
    return "Cita cancelada." if not d.get("error") else f"No se pudo cancelar: {d.get('error')}"


@servidor.tool(name="anotar_recado", description="Deja un recado para el dueño (teléfono, asunto, nombre y detalle); aparece en Recados del panel.")
async def anotar_recado(ctx: Context, telefono: str, asunto: str, nombre: str = "", detalle: str = "") -> str:
    t = await _tenant(ctx)
    await db.uno("select registrar_recado($1, $2, $3, $4, $5, '{}'::jsonb, null)", t, "".join(c for c in telefono if c.isdigit()) or telefono, asunto, nombre or None, detalle or None)
    return "Recado anotado."


@servidor.tool(name="registrar_pago", description="Registra un pago recibido (monto en pesos, concepto, método: efectivo, transferencia o tarjeta) a nombre de un cliente por teléfono. Pide aprobación del dueño.")
async def registrar_pago(ctx: Context, telefono: str, monto: float, concepto: str, metodo: str = "efectivo") -> str:
    t = await _tenant(ctx)
    c = await db.uno("select id, nombre from cliente where tenant_id = $1 and telefono like '%' || $2 limit 1", t, "".join(ch for ch in telefono if ch.isdigit())[-10:])
    await db.ejecutar("insert into pago (tenant_id, cliente_id, concepto, monto, metodo, estado, pagado_en) values ($1, $2, $3, $4, $5, 'pagado', now())", t, c["id"] if c else None, concepto, monto, metodo)
    return f"Pago de ${monto:,.0f} registrado{(' a ' + c['nombre']) if c else ''}."


# --- WhatsApp: escribir a clientes por la línea del negocio ---------------

whatsapp = MCPServer("whatsapp", instructions="Manda mensajes de WhatsApp desde la línea del negocio. Solo con permiso explícito del dueño en este hilo; nunca invente destinatarios.")


@whatsapp.tool(name="enviar_whatsapp", description="Envía un mensaje de WhatsApp a un teléfono (10 dígitos de México o con lada) desde la línea del negocio. Úselo solo cuando el dueño lo haya aprobado en el hilo.")
async def enviar_whatsapp(ctx: Context, telefono: str, mensaje: str) -> str:
    t = await _tenant(ctx)
    digitos = "".join(c for c in telefono if c.isdigit())
    if len(digitos) == 10:
        digitos = "52" + digitos
    if not (11 <= len(digitos) <= 15) or not mensaje.strip():
        return "Teléfono o mensaje inválido."
    if not await db.uno("select 1 from tenant where id = $1 and telefono_entrada is not null", t):
        return "Este negocio no tiene línea de WhatsApp configurada."
    import json as _json
    await db.ejecutar(
        "insert into outbox (tenant_id, canal, destino, plantilla, payload) values ($1, 'whatsapp', $2, 'campana', $3::jsonb)",
        t, digitos, _json.dumps({"mensaje": mensaje.strip(), "origen": "agente"}))
    return f"Mensaje en cola para +{digitos}. Sale en menos de un minuto; si el cliente no ha escrito en 24 h, WhatsApp puede rechazarlo y el panel lo mostrará."


def app_whatsapp():
    return whatsapp.streamable_http_app(
        streamable_http_path="/", stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))
