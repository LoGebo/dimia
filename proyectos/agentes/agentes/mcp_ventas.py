"""La Vendedora (rol «ventas»): las funciones del motor de ventas como herramientas.

Dos servidores, por cómo se aprueban:
- `ventas` (trust untrusted): leer interesados, conversaciones, resultados y la configuración;
  ajustar el seguimiento pide la aprobación del dueño en el hilo.
- `ventas_memoria` (sin trust): anotar sobre un interesado. Es su memoria interna, no sale al
  cliente y sus rutinas corren sin nadie que apruebe; por eso no pasa por la puerta.

Nada aquí contacta a nadie: cuándo y por qué canal se escribe lo decide el motor
(proyectos/voz/supabase/migrations/20260929*_ventas_*.sql), con consentimiento, bajas y horario.
"""
import json
import re
import uuid as _uuid

from mcp.server.mcpserver import Context, MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError
from mcp_types import ToolAnnotations

from agentes import db

SOLO_LECTURA = ToolAnnotations(readOnlyHint=True)
ETAPAS_ACTIVAS = ("nuevo", "contactado", "en_conversacion", "requiere_persona")

ventas = MCPServer("ventas", instructions=(
    "El motor de ventas del negocio: interesados, sus conversaciones, resultados y cómo se les da seguimiento. "
    "Lea antes de opinar. Usted no manda mensajes: el motor lo hace según la configuración. "
    "ajustar_seguimiento pide la aprobación del dueño; antes de llamarla diga en una frase qué cambia."))
memoria = MCPServer("ventas_memoria", instructions=(
    "Su memoria sobre cada interesado. Anote lo que sirva para venderle mejor: objeciones, qué busca, "
    "con quién decide, qué se le prometió. El agente que contesta por WhatsApp lee estas notas."))


async def _tenant(ctx: Context) -> str:
    token = (ctx.headers or {}).get("authorization", "").removeprefix("Bearer ").strip()
    f = await db.uno("select tenant_id from agente where mcp_token = $1 and mcp_token is not null", token) if token else None
    if not f:
        raise MCPError(-32000, "Token de agente inválido")
    return str(f["tenant_id"])


def _id(texto: str) -> _uuid.UUID:
    try:
        return _uuid.UUID(texto.strip())
    except ValueError:
        raise MCPError(-32602, "Id de interesado inválido: use el id que da `interesados`.") from None


def _fecha(v) -> str:
    return f"{v:%Y-%m-%d %H:%M}" if v else "—"


@ventas.tool(annotations=SOLO_LECTURA, name="resumen_ventas", description="Cómo va la venta en los últimos N días (default 30): interesados, contactados, contestaron, con cita, perdidos, bajas, esperando a una persona, tiempo de primera respuesta y la prueba A/B en curso.")
async def resumen_ventas(ctx: Context, dias: int = 30) -> str:
    t = await _tenant(ctx)
    r = await db.uno(
        """with i as (select * from interesado where tenant_id = $1 and creado >= now() - make_interval(days => $2))
           select count(*) interesados,
                  count(*) filter (where primer_toque_en is not null) contactados,
                  count(*) filter (where ultimo_mensaje_cliente_en > primer_toque_en or etapa in ('en_conversacion','cita','asistio','vendido')) contestaron,
                  count(*) filter (where etapa in ('cita','asistio','vendido')) con_cita,
                  count(*) filter (where etapa = 'perdido') perdidos,
                  count(*) filter (where etapa = 'baja') bajas,
                  count(*) filter (where etapa = 'requiere_persona') esperan_persona,
                  round(percentile_cont(0.5) within group (order by extract(epoch from primer_toque_en - creado))) p50
             from i""", t, max(1, min(dias, 365)))
    lineas = [f"Últimos {dias} días: {r['interesados']} interesados, {r['contactados']} contactados, {r['contestaron']} contestaron, "
              f"{r['con_cita']} con cita, {r['perdidos']} perdidos, {r['bajas']} bajas, {r['esperan_persona']} esperan a una persona."]
    if r["p50"] is not None:
        lineas.append(f"Primera respuesta en {int(r['p50'])} s (mediana).")
    e = await db.uno("select id, nombre from experimento where tenant_id = $1 and estado = 'activo'", t)
    if e:
        res = await db.todos("select * from public.experimento_resultados($1)", e["id"])
        lineas.append(f"Prueba A/B en curso «{e['nombre']}»: " + "; ".join(
            f"{x['variante']}: {x['asignados']} personas, {x['contestaron']} contestaron, {x['agendaron']} agendaron" for x in res))
    return "\n".join(lineas)


@ventas.tool(annotations=SOLO_LECTURA, name="interesados", description="Lista de interesados. filtro: 'activos' (en curso, default), 'necesitan' (esperan a una persona), 'perdidos' o 'todos'. Da id, etapa, intención, urgencia, puntaje, servicio y la lectura del intérprete.")
async def interesados(ctx: Context, filtro: str = "activos", limite: int = 30) -> str:
    t = await _tenant(ctx)
    cond = {
        "activos": "etapa::text = any($2::text[])",
        "necesitan": "etapa = 'requiere_persona'",
        "perdidos": "etapa = 'perdido'",
        "todos": "true",
    }.get(filtro, "etapa::text = any($2::text[])")
    filas = await db.todos(
        f"""select id, coalesce(nombre, contacto) nombre, canal, etapa::text etapa, intencion, urgencia, puntuacion, servicio, lectura,
                   proxima_accion_en, ultimo_mensaje_cliente_en, tomado_por_persona
              from interesado where tenant_id = $1 and {cond} and ($2::text[] is not null)
             order by puntuacion desc nulls last, ultimo_mensaje_cliente_en desc nulls last limit $3""",
        t, list(ETAPAS_ACTIVAS), max(1, min(limite, 100)))
    if not filas:
        return "No hay interesados con ese filtro."
    return "\n".join(
        f"{f['id']} · {f['nombre']} · {f['canal']} · {f['etapa']}{' · lo lleva una persona' if f['tomado_por_persona'] else ''}"
        f" · {f['intencion'] or 'sin leer'}/{f['urgencia'] or '—'} · puntaje {f['puntuacion'] if f['puntuacion'] is not None else '—'}"
        f"{' · ' + f['servicio'] if f['servicio'] else ''} · último mensaje {_fecha(f['ultimo_mensaje_cliente_en'])}"
        f" · siguiente seguimiento {_fecha(f['proxima_accion_en'])}{chr(10) + '   ' + f['lectura'] if f['lectura'] else ''}"
        for f in filas)


@ventas.tool(annotations=SOLO_LECTURA, name="interesado", description="Todo de un interesado por su id: ficha, la conversación completa (últimos 40 mensajes), lo que ha pasado (eventos) y sus notas.")
async def interesado(ctx: Context, id: str) -> str:
    t = await _tenant(ctx)
    i = await db.uno("select * from interesado where id = $1 and tenant_id = $2", _id(id), t)
    if not i:
        return "No existe ese interesado en este negocio."
    partes = [f"{i['nombre'] or i['contacto']} · {i['canal']} · {i['contacto']} · etapa {i['etapa']} · origen {i['origen'] or '—'}",
              f"Intención {i['intencion'] or '—'}, urgencia {i['urgencia'] or '—'}, puntaje {i['puntuacion'] if i['puntuacion'] is not None else '—'}, servicio {i['servicio'] or '—'}.",
              f"Lectura: {i['lectura'] or '—'}"]
    if i["conversacion_id"]:
        msgs = await db.todos(
            "select * from (select autor::text autor, texto, creado from mensaje where conversacion_id = $1 order by creado desc limit 40) m order by creado",
            i["conversacion_id"])
        partes.append("\n## Conversación")
        partes += [f"[{_fecha(m['creado'])}] {m['autor']}: {m['texto']}" for m in msgs] or ["(sin mensajes)"]
    eventos = await db.todos("select tipo, canal, detalle, creado from interesado_evento where interesado_id = $1 order by creado desc limit 20", i["id"])
    if eventos:
        partes.append("\n## Eventos")
        partes += [f"[{_fecha(e['creado'])}] {e['tipo']}{' · ' + e['canal'] if e['canal'] else ''}" for e in reversed(eventos)]
    notas = await db.todos("select texto, creado from interesado_nota where interesado_id = $1 order by creado desc limit 20", i["id"])
    if notas:
        partes.append("\n## Sus notas")
        partes += [f"[{_fecha(n['creado'])}] {n['texto']}" for n in reversed(notas)]
    return "\n".join(partes)


@ventas.tool(annotations=SOLO_LECTURA, name="seguimiento", description="Cómo da seguimiento el negocio hoy: si está encendido, objetivo, nivel, trato, horario, preguntas antes de agendar, cuándo pasar a una persona y los mensajes que salen.")
async def seguimiento(ctx: Context) -> str:
    t = await _tenant(ctx)
    c = await db.uno("select *, public.seguimiento_pasos(s) pasos_efectivos from seguimiento_config s where tenant_id = $1", t)
    if not c:
        return "Todavía no hay configuración: el seguimiento está apagado y el objetivo es agendar."
    pasos = c["pasos_efectivos"]
    pasos = json.loads(pasos) if isinstance(pasos, str) else pasos or []
    carga = lambda v: json.loads(v) if isinstance(v, str) else (v or [])  # noqa: E731
    canales = carga(c["canales"]) if c["canales"] else {}
    return "\n".join([
        f"Seguimiento {'encendido' if c['activo'] else 'apagado'} · nivel {c['nivel']} · trato de {c['trato']} · {c['dias']} de {c['hora_inicio']:%H:%M} a {c['hora_fin']:%H:%M}"
        f"{' · con llamada en el primer seguimiento' if isinstance(canales, dict) and canales.get('llamada') else ''}",
        f"Objetivo: {c['objetivo']}",
        "Preguntas antes de agendar: " + (" | ".join(carga(c["preguntas"])) or "ninguna"),
        "Pasa a una persona si: " + (" | ".join(carga(c["escalar"])) or "nunca"),
        "Mensajes: " + ("; ".join(f"a las {p['horas']} h «{p['mensaje']}»" for p in pasos) or "ninguno"),
    ])


NIVELES = {"suave", "normal", "insistente"}
DIAS = {"lun-vie", "lun-sab", "todos"}
HORA = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def validar_ajuste(actual: dict, cambios: dict) -> dict | str:
    """La configuración resultante, o por qué no se puede. Mismas reglas que el formulario del panel
    (web/lib/acciones-ventas.ts: guardarSeguimiento): el motor confía en estos valores."""
    n = {**actual}
    for k in ("objetivo", "trato", "dias", "hora_inicio", "hora_fin", "nivel"):
        v = cambios.get(k)
        if isinstance(v, str) and v.strip():
            n[k] = v.strip()
    if cambios.get("activo") is not None:
        n["activo"] = bool(cambios["activo"])
    for k, tope in (("preguntas", 4), ("escalar", 8)):
        if cambios.get(k) is not None:
            n[k] = [str(x).strip() for x in cambios[k] if str(x).strip()][:tope]
    if cambios.get("llamada") is not None:
        n["canales"] = {**(n.get("canales") or {}), "whatsapp": True, "llamada": bool(cambios["llamada"]), "correo": False}
    if cambios.get("nivel"):
        n["pasos"] = None
    if cambios.get("mensajes"):
        pasos = [{"horas": int(p.get("horas", 0)), "mensaje": str(p.get("mensaje", "")).strip()[:600]} for p in cambios["mensajes"]]
        pasos = [p for p in pasos if p["mensaje"] and 1 <= p["horas"] <= 23][:4]
        if not pasos:
            return "Los mensajes propios necesitan texto y una hora entre 1 y 23."
        n["nivel"], n["pasos"] = "propio", pasos
    n["objetivo"] = (n.get("objetivo") or "agendar")[:200]
    if n["nivel"] not in NIVELES | {"propio"} or n["dias"] not in DIAS or n["trato"] not in ("usted", "tu"):
        return "Nivel, días o trato no válidos."
    if not HORA.match(n["hora_inicio"]) or not HORA.match(n["hora_fin"]) or n["hora_inicio"] >= n["hora_fin"]:
        return "El horario debe ser HH:MM y la hora de inicio antes de la de fin."
    if n["nivel"] == "propio" and not n.get("pasos"):
        return "Con mensajes propios hace falta al menos uno."
    return n


BASE = {"activo": False, "nivel": "normal", "dias": "lun-sab", "hora_inicio": "09:00", "hora_fin": "20:00", "objetivo": "agendar",
        "trato": "usted", "preguntas": ["¿Qué servicio busca?", "¿Para cuándo lo necesita?"],
        "escalar": ["Pregunta un precio fuera del catálogo", "Se molesta o se queja", "Pide hablar con una persona"],
        "pasos": None, "canales": {"whatsapp": True, "llamada": False, "correo": False}}


@ventas.tool(name="ajustar_seguimiento", description=(
    "Cambia cómo se da seguimiento. Pide la aprobación del dueño. Mande solo lo que cambia: objetivo (una frase), activo, "
    "nivel (suave|normal|insistente), trato (usted|tu), dias (lun-vie|lun-sab|todos), hora_inicio/hora_fin (HH:MM), "
    "preguntas (lista completa, máx. 4), escalar (lista completa de casos para pasar a una persona), llamada (en el primer seguimiento), "
    "mensajes (lista de {horas: 1-23, mensaje} desde su última respuesta; {nombre} se cambia por el nombre)."))
async def ajustar_seguimiento(ctx: Context, objetivo: str | None = None, activo: bool | None = None, nivel: str | None = None,
                              trato: str | None = None, dias: str | None = None, hora_inicio: str | None = None, hora_fin: str | None = None,
                              preguntas: list[str] | None = None, escalar: list[str] | None = None, llamada: bool | None = None,
                              mensajes: list[dict] | None = None) -> str:
    t = await _tenant(ctx)
    f = await db.uno(
        """select activo, nivel, dias, to_char(hora_inicio, 'HH24:MI') hora_inicio, to_char(hora_fin, 'HH24:MI') hora_fin,
                  objetivo, trato, preguntas, escalar, pasos, canales from seguimiento_config where tenant_id = $1""", t)
    actual = dict(BASE)
    if f:
        actual = {k: (json.loads(v) if isinstance(v, str) and k in ("preguntas", "escalar", "pasos", "canales") else v) for k, v in dict(f).items()}
    n = validar_ajuste(actual, {"objetivo": objetivo, "activo": activo, "nivel": nivel, "trato": trato, "dias": dias, "hora_inicio": hora_inicio,
                                "hora_fin": hora_fin, "preguntas": preguntas, "escalar": escalar, "llamada": llamada, "mensajes": mensajes})
    if isinstance(n, str):
        raise MCPError(-32602, n)
    await db.ejecutar(
        """insert into seguimiento_config (tenant_id, activo, nivel, dias, hora_inicio, hora_fin, objetivo, trato, preguntas, escalar, pasos, canales, actualizado)
           values ($1, $2, $3, $4, $5::text::time, $6::text::time, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, now())
           on conflict (tenant_id) do update set activo = excluded.activo, nivel = excluded.nivel, dias = excluded.dias, canales = excluded.canales,
             hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, objetivo = excluded.objetivo, trato = excluded.trato,
             preguntas = excluded.preguntas, escalar = excluded.escalar, pasos = excluded.pasos, actualizado = now()""",
        t, n["activo"], n["nivel"], n["dias"], n["hora_inicio"], n["hora_fin"], n["objetivo"], n["trato"],
        json.dumps(n["preguntas"], ensure_ascii=False), json.dumps(n["escalar"], ensure_ascii=False),
        json.dumps(n["pasos"], ensure_ascii=False) if n["pasos"] else None, json.dumps(n["canales"]))
    return "Listo. " + await seguimiento(ctx)


@memoria.tool(name="anotar", description="Guarda una nota sobre un interesado (por su id): objeción, qué busca, quién decide, qué se le prometió. Corta y concreta; el agente de WhatsApp la lee antes de contestarle.")
async def anotar(ctx: Context, id: str, nota: str) -> str:
    t = await _tenant(ctx)
    texto = nota.strip()[:1000]
    if not texto:
        raise MCPError(-32602, "La nota está vacía.")
    i = await db.uno("select id from interesado where id = $1 and tenant_id = $2", _id(id), t)
    if not i:
        raise MCPError(-32602, "No existe ese interesado en este negocio.")
    await db.ejecutar("insert into interesado_nota (tenant_id, interesado_id, texto) values ($1, $2, $3)", t, i["id"], texto)
    return "Anotado."


def _app(s: MCPServer):
    return s.streamable_http_app(
        streamable_http_path="/", stateless_http=True, json_response=True,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=False))


def app():
    return _app(ventas)


def app_memoria():
    return _app(memoria)
