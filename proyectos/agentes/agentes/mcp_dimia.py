"""Dimia como integración: las herramientas del negocio (citas, clientes,
cobros, servicios) para los agentes, por MCP. Cada agente entra con su propio
token y solo ve su negocio. Solo lectura por ahora."""
from datetime import date, datetime, timedelta

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError

from agentes import db

servidor = MCPServer("dimia", instructions="Datos reales del negocio del dueño: citas, clientes, cobros y servicios. Úselos antes de suponer.")


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


@servidor.tool(name="citas", description="Citas del negocio en un día. dia: 'hoy', 'mañana' o AAAA-MM-DD.")
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


@servidor.tool(name="buscar_cliente", description="Busca clientes por nombre o teléfono; da citas, faltas y lo gastado.")
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


@servidor.tool(name="clientes_sin_volver", description="Clientes que ya vinieron y no han vuelto en N días (default 90).")
async def clientes_sin_volver(ctx: Context, dias: int = 90) -> str:
    t = await _tenant(ctx)
    filas = await db.todos(
        """select c.nombre, c.telefono, c.ultimo_contacto from cliente c
            where c.tenant_id = $1 and c.ultimo_contacto < now() - make_interval(days => $2)
              and exists (select 1 from booking b where b.cliente_id = c.id and b.estado = 'completada')
            order by c.ultimo_contacto limit 30""", t, dias)
    return "\n".join(f"{f['nombre']} · {f['telefono'] or ''} · {f['ultimo_contacto']:%Y-%m-%d}" for f in filas) or "Nadie lleva tanto sin volver."


@servidor.tool(name="cobros", description="Pagos pendientes y lo cobrado en los últimos N días (default 7).")
async def cobros(ctx: Context, dias: int = 7) -> str:
    t = await _tenant(ctx)
    pend = await db.todos("select c.nombre, g.concepto, g.monto, g.creado from pago g left join cliente c on c.id = g.cliente_id where g.tenant_id = $1 and g.estado = 'pendiente' order by g.creado desc limit 30", t)
    tot = await db.uno("select coalesce(sum(monto), 0) as total, count(*) as n from pago where tenant_id = $1 and estado = 'pagado' and coalesce(pagado_en, creado) >= now() - make_interval(days => $2)", t, dias)
    lineas = [f"Cobrado en {dias} días: ${tot['total']:,.0f} en {tot['n']} pagos."]
    lineas += [f"Pendiente: {p['nombre'] or 'sin cliente'} · {p['concepto'] or ''} · ${p['monto']:,.0f} · {p['creado']:%Y-%m-%d}" for p in pend] or ["Sin pagos pendientes."]
    return "\n".join(lineas)


@servidor.tool(name="servicios", description="Servicios activos del negocio con duración y precio.")
async def servicios(ctx: Context) -> str:
    t = await _tenant(ctx)
    filas = await db.todos("select nombre, duracion_min, precio from service where tenant_id = $1 and activo order by nombre", t)
    return "\n".join(f"{f['nombre']} · {f['duracion_min']} min · ${f['precio'] or 0:,.0f}" for f in filas) or "Sin servicios dados de alta."


def app():
    """ASGI para montar en /mcp. Sin estado: cada llamada trae su token."""
    return servidor.streamable_http_app(
        streamable_http_path="/", stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))
