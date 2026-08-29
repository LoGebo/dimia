import "server-only";

import type { Consulta } from "@/lib/db";
import { fechaLarga, hora, isoDia, moneda, telefono as formatearTelefono } from "@/lib/formato";
import type { Membresia, Negocio, Recurso, Servicio } from "@/lib/tipos";

/** Un turno del chat tal como lo guarda el navegador. */
export type TurnoCopiloto = { rol: "usuario" | "asistente"; texto: string };

/** Lo que el copiloto propone hacer; se ejecuta solo cuando el dueño lo aprueba. */
export type Propuesta = {
  accion: "campana" | "bloqueo" | "cita" | "cancelar_cita" | "atendida" | "cobro" | "enlace_pago";
  args: Record<string, string | number | null>;
  resumen: string;
};

export type RespuestaCopiloto = {
  texto: string;
  pasos: { herramienta: string; detalle: string }[];
  propuesta?: Propuesta;
};

type Mensaje =
  | { role: "system" | "user" | "assistant"; content: string; tool_calls?: LlamadaHerramienta[] }
  | { role: "tool"; tool_call_id: string; content: string };

type LlamadaHerramienta = { id: string; type: "function"; function: { name: string; arguments: string } };

type Contexto = {
  q: Consulta;
  negocioId: string;
  negocio: Negocio;
  membresia: Membresia | undefined;
  servicios: Servicio[];
  recursos: Recurso[];
};

const MODELO = process.env.COPILOTO_MODELO ?? "gpt-4.1-mini";
const MAX_ITERACIONES = 6;
const MAX_FILAS = 60;

const HERRAMIENTAS = [
  herramienta("citas", "Citas o reservaciones entre dos fechas (YYYY-MM-DD, inclusive). Trae estado, cliente, servicio, quién atiende, hora y si ya se cobró.", {
    desde: { type: "string" },
    hasta: { type: "string" },
  }, ["desde", "hasta"]),
  herramienta("buscar_cita", "Busca citas por código, nombre o teléfono del cliente.", { q: { type: "string" } }, ["q"]),
  herramienta(
    "clientes",
    "Lista de clientes por segmento: todos, nuevos (30 días), frecuentes (3+ visitas), inactivos (90 días sin contacto), faltan (con alguna falta). Filtro opcional por nombre.",
    { segmento: { type: "string", enum: ["todos", "nuevos", "frecuentes", "inactivos", "faltan"] }, q: { type: "string" } },
    ["segmento"],
  ),
  herramienta("cliente", "Ficha de un cliente por id: datos, citas, pedidos, pagos y últimas conversaciones.", { id: { type: "string" } }, ["id"]),
  herramienta("cobros", "Cobros registrados en un rango de días (YYYY-MM-DD): monto, método, estado, concepto y cliente.", { desde: { type: "string" }, hasta: { type: "string" } }, ["desde", "hasta"]),
  herramienta("cobros_pendientes", "Pagos que siguen pendientes de cobrar.", {}, []),
  herramienta("llamadas", "Resumen de llamadas de los últimos N días: total, resueltas por el agente, escaladas, por día.", { dias: { type: "integer" } }, ["dias"]),
  herramienta("conversaciones", "Últimas conversaciones (llamadas, WhatsApp, redes) con su cierre: motivo, resultado, resumen.", { n: { type: "integer" } }, []),
  herramienta("recados", "Recados pendientes de regresar la llamada.", {}, []),
  herramienta("campanas", "Campañas existentes con avance: enviados, contestaron, agendaron.", {}, []),
  herramienta("equipo", "Productividad por persona del equipo entre dos fechas: citas atendidas, cobrado, comisión.", { desde: { type: "string" }, hasta: { type: "string" } }, ["desde", "hasta"]),
  herramienta(
    "consulta_sql",
    "Consulta SQL de solo lectura (SELECT) sobre las tablas del negocio cuando ninguna herramienta específica alcanza. Tablas: cliente, booking, pedido, pedido_item, pago, call_log, conversacion, mensaje, lead (recados), campana, campana_contacto, resena, service, resource, evento. Todas llevan tenant_id y ya vienen filtradas por el negocio. Máximo 60 filas.",
    { sql: { type: "string" } },
    ["sql"],
  ),
  herramienta(
    "proponer_campana",
    "Propone una campaña de WhatsApp o llamadas a un segmento. tipo: no_show (faltaron), inactivos (no han vuelto), recordatorio_pago, resena, marketing (lista propia). dias: ventana del segmento. El dueño la aprueba antes de crearla.",
    {
      nombre: { type: "string" },
      tipo: { type: "string", enum: ["no_show", "inactivos", "recordatorio_pago", "resena", "marketing"] },
      canal: { type: "string", enum: ["whatsapp", "llamada"] },
      mensaje: { type: "string", description: "Texto que recibirá el cliente, en usted, corto, sin promesas inventadas." },
      dias: { type: "integer" },
    },
    ["nombre", "tipo", "canal", "mensaje"],
  ),
  herramienta(
    "proponer_bloqueo",
    "Propone bloquear la agenda de una persona o lugar (resource_id) entre dos fechas, con motivo. Fechas YYYY-MM-DD.",
    { resource_id: { type: "string" }, desde: { type: "string" }, hasta: { type: "string" }, motivo: { type: "string" } },
    ["resource_id", "desde"],
  ),
  herramienta(
    "proponer_cita",
    "Propone agendar una cita: servicio (service_id), quién atiende (resource_id), inicio en ISO con zona (p. ej. 2026-09-02T10:00:00-06:00), nombre y teléfono del cliente.",
    {
      service_id: { type: "string" },
      resource_id: { type: "string" },
      inicio: { type: "string" },
      cliente_nombre: { type: "string" },
      telefono: { type: "string" },
      notas: { type: "string" },
    },
    ["service_id", "resource_id", "inicio", "cliente_nombre", "telefono"],
  ),
  herramienta("proponer_cancelar_cita", "Propone cancelar una cita por su id.", { id: { type: "string" }, motivo: { type: "string" } }, ["id"]),
  herramienta("proponer_atendida", "Propone marcar una cita como atendida (terminada) por su id.", { id: { type: "string" } }, ["id"]),
  herramienta(
    "proponer_cobro",
    "Propone registrar un cobro ya recibido sobre una cita (booking_id) o pedido (pedido_id): monto, método (efectivo, tarjeta, transferencia, otro) y concepto.",
    { booking_id: { type: "string" }, pedido_id: { type: "string" }, monto: { type: "number" }, metodo: { type: "string", enum: ["efectivo", "tarjeta", "transferencia", "otro"] }, concepto: { type: "string" } },
    ["monto", "metodo", "concepto"],
  ),
  herramienta(
    "proponer_enlace_pago",
    "Propone crear un enlace de pago con la pasarela conectada y mandarlo por WhatsApp al cliente de una cita o pedido.",
    { booking_id: { type: "string" }, pedido_id: { type: "string" }, monto: { type: "number" }, concepto: { type: "string" }, proveedor: { type: "string", enum: ["mercadopago", "clip", "stripe"] } },
    ["monto", "concepto", "proveedor"],
  ),
];

function herramienta(name: string, description: string, props: Record<string, unknown>, required: string[]) {
  return { type: "function", function: { name, description, parameters: { type: "object", properties: props, required, additionalProperties: false } } };
}

function sistema(c: Contexto): string {
  const zona = c.negocio.zona_horaria;
  const hoy = isoDia(new Date(), zona);
  const ahora = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: zona }).format(new Date());
  return `Eres el copiloto de ${c.negocio.nombre} (${c.membresia?.vertical_nombre ?? "negocio"}) dentro del panel Dimia. Hablas con el dueño o su equipo.

Hoy es ${fechaLarga(`${hoy}T12:00:00Z`, "UTC")} (${hoy}), son las ${ahora}, zona ${zona}.

Servicios: ${c.servicios.map((s) => `${s.nombre} [${s.id}] ${s.duracion_min} min${s.precio ? ` $${s.precio}` : ""}`).join("; ") || "ninguno"}.
Quién atiende: ${c.recursos.map((r) => `${r.nombre} [${r.id}]`).join("; ") || "nadie"}.

Cómo trabajas:
- Contesta con datos: usa las herramientas antes de afirmar cualquier cifra. Nunca inventes números, nombres ni resultados.
- Respuestas cortas, en español de México, de tú con el dueño. Primero el dato, luego el contexto. Montos en pesos.
- Si te piden hacer algo (campaña, bloqueo, cita, cancelación, cobro, enlace), primero consulta lo necesario y luego usa la herramienta "proponer_…" correspondiente: el dueño aprueba antes de que pase. Propón una sola acción por turno.
- Con fechas relativas ("mañana", "la semana pasada") calcula la fecha exacta a partir de hoy.
- Cuando muestres listas, máximo 10 renglones; ofrece ver más.
- Si algo no existe en el negocio, dilo tal cual.`;
}

export async function conversar(c: Contexto, historial: TurnoCopiloto[]): Promise<RespuestaCopiloto> {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) return { texto: "El copiloto no está configurado en este servidor (falta OPENAI_API_KEY).", pasos: [] };

  const mensajes: Mensaje[] = [
    { role: "system", content: sistema(c) },
    ...historial.slice(-16).map((t) => ({ role: t.rol === "usuario" ? ("user" as const) : ("assistant" as const), content: t.texto })),
  ];
  const pasos: RespuestaCopiloto["pasos"] = [];
  let propuesta: Propuesta | undefined;

  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODELO, messages: mensajes, tools: HERRAMIENTAS, tool_choice: "auto", temperature: 0.2, max_tokens: 900 }),
      cache: "no-store",
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => "");
      return { texto: `El modelo no respondió (${r.status}). ${detalle.slice(0, 160)}`, pasos };
    }
    const data = (await r.json()) as { choices: { message: { content: string | null; tool_calls?: LlamadaHerramienta[] } }[] };
    const msg = data.choices[0]?.message;
    if (!msg) break;

    if (!msg.tool_calls?.length) return { texto: (msg.content ?? "").trim() || "No tengo nada que agregar.", pasos, propuesta };

    mensajes.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    for (const llamada of msg.tool_calls) {
      let args: Record<string, string | number | null> = {};
      try {
        args = JSON.parse(llamada.function.arguments || "{}");
      } catch {}
      const nombre = llamada.function.name;
      let resultado: unknown;
      try {
        if (nombre.startsWith("proponer_")) {
          propuesta = armarPropuesta(c, nombre, args);
          resultado = { propuesta_registrada: true, resumen: propuesta.resumen, nota: "Dile al dueño qué propones en una frase; él la aprueba con el botón." };
          pasos.push({ herramienta: nombre, detalle: propuesta.resumen });
        } else {
          resultado = await ejecutarConsulta(c, nombre, args);
          pasos.push({ herramienta: nombre, detalle: describir(nombre, args) });
        }
      } catch (e) {
        resultado = { error: e instanceof Error ? e.message : "falló la herramienta" };
        pasos.push({ herramienta: nombre, detalle: `falló: ${resultado && typeof resultado === "object" && "error" in resultado ? (resultado as { error: string }).error : ""}` });
      }
      mensajes.push({ role: "tool", tool_call_id: llamada.id, content: JSON.stringify(resultado).slice(0, 12000) });
    }
  }
  return { texto: "Consulté varias cosas pero no alcancé a cerrar la respuesta. Pregúntame de nuevo, más acotado.", pasos, propuesta };
}

function describir(nombre: string, args: Record<string, unknown>): string {
  const partes = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`);
  return partes.length ? `${nombre} (${partes.join(", ")})` : nombre;
}

async function ejecutarConsulta(c: Contexto, nombre: string, a: Record<string, string | number | null>): Promise<unknown> {
  const { q, negocioId } = c;
  const zona = c.negocio.zona_horaria;
  const s = (k: string) => String(a[k] ?? "").trim();
  const n = (k: string, d: number) => (Number.isFinite(Number(a[k])) && Number(a[k]) > 0 ? Number(a[k]) : d);

  switch (nombre) {
    case "citas":
      return q(
        `select b.id, b.codigo, b.estado, b.inicio, b.fin, b.llegada, b.personas, b.notas, b.cliente_id,
                coalesce(c.nombre, b.cliente_nombre) as cliente, b.telefono, s.nombre as servicio, r.nombre as atiende,
                (select sum(g.monto) from pago g where g.booking_id = b.id and g.estado = 'pagado') as cobrado
           from booking b
           left join cliente c on c.id = b.cliente_id
           left join service s on s.id = b.service_id
           left join resource r on r.id = b.resource_id
          where b.tenant_id = $1 and (b.inicio at time zone $4)::date between $2::date and $3::date
          order by b.inicio limit ${MAX_FILAS}`,
        [negocioId, s("desde"), s("hasta") || s("desde"), zona],
      ).then((filas) => filas.map((f) => formatearCita(f as Record<string, unknown>, zona)));
    case "buscar_cita":
      return q(
        `select b.id, b.codigo, b.estado, b.inicio, coalesce(c.nombre, b.cliente_nombre) as cliente, b.telefono, s.nombre as servicio, r.nombre as atiende
           from booking b left join cliente c on c.id = b.cliente_id left join service s on s.id = b.service_id left join resource r on r.id = b.resource_id
          where b.tenant_id = $1 and (b.codigo ilike '%' || $2 || '%' or coalesce(c.nombre, b.cliente_nombre) ilike '%' || $2 || '%' or b.telefono like '%' || $2 || '%')
          order by b.inicio desc limit 20`,
        [negocioId, s("q")],
      ).then((filas) => filas.map((f) => formatearCita(f as Record<string, unknown>, zona)));
    case "clientes": {
      const cond: Record<string, string> = {
        todos: "true",
        nuevos: "c.primer_contacto >= now() - interval '30 days'",
        frecuentes: `((select count(*) from booking b where b.cliente_id = c.id and b.estado = 'completada') + (select count(*) from pedido p where p.cliente_id = c.id and p.estado = 'entregado')) >= 3`,
        inactivos: "c.ultimo_contacto < now() - interval '90 days'",
        faltan: "exists (select 1 from booking b where b.cliente_id = c.id and b.estado = 'no_asistio')",
      };
      const seg = cond[s("segmento")] ? s("segmento") : "todos";
      return q(
        `select c.id, c.nombre, c.telefono, c.origen, c.etiquetas, c.primer_contacto, c.ultimo_contacto,
                (select count(*) from booking b where b.cliente_id = c.id and b.estado = 'completada')::int as atendidas,
                (select count(*) from booking b where b.cliente_id = c.id and b.estado = 'no_asistio')::int as faltas,
                (select coalesce(sum(g.monto),0) from pago g where g.cliente_id = c.id and g.estado = 'pagado') as gastado
           from cliente c
          where c.tenant_id = $1 and ${cond[seg]} and ($2 = '' or c.nombre ilike '%' || $2 || '%' or c.telefono like '%' || $2 || '%')
          order by c.ultimo_contacto desc nulls last limit ${MAX_FILAS}`,
        [negocioId, s("q")],
      ).then((filas) => filas.map((f) => ({ ...(f as object), telefono: formatearTelefono(String((f as { telefono: string }).telefono)) })));
    }
    case "cliente": {
      const [ficha] = await q(`select id, nombre, telefono, correo, origen, etiquetas, notas, primer_contacto, ultimo_contacto from cliente where id = $1 and tenant_id = $2`, [s("id"), negocioId]);
      if (!ficha) return { error: "no existe ese cliente" };
      const citas = await q(`select b.codigo, b.estado, b.inicio, s.nombre as servicio from booking b left join service s on s.id = b.service_id where b.cliente_id = $1 order by b.inicio desc limit 10`, [s("id")]);
      const pagos = await q(`select monto, metodo, estado, concepto, creado from pago where cliente_id = $1 order by creado desc limit 10`, [s("id")]);
      const charlas = await q(`select canal, estado, motivo, resultado, resumen, creado from conversacion where cliente_id = $1 order by creado desc limit 5`, [s("id")]);
      return { ficha, citas: citas.map((f) => formatearCita(f as Record<string, unknown>, zona)), pagos, conversaciones: charlas };
    }
    case "cobros":
      return q(
        `select g.id, g.concepto, g.monto, g.metodo, g.estado, g.proveedor, g.pagado_en, g.creado, c.nombre as cliente, g.booking_id, g.pedido_id
           from pago g left join cliente c on c.id = g.cliente_id
          where g.tenant_id = $1 and (coalesce(g.pagado_en, g.creado) at time zone $4)::date between $2::date and $3::date
          order by g.creado desc limit ${MAX_FILAS}`,
        [negocioId, s("desde"), s("hasta") || s("desde"), zona],
      );
    case "cobros_pendientes":
      return q(`select g.id, g.concepto, g.monto, g.metodo, g.enlace_url, g.creado, c.nombre as cliente, c.telefono from pago g left join cliente c on c.id = g.cliente_id where g.tenant_id = $1 and g.estado = 'pendiente' order by g.creado desc limit ${MAX_FILAS}`, [negocioId]);
    case "llamadas": {
      const dias = n("dias", 7);
      const porDia = await q(
        `with rango as (select generate_series(current_date - ($2::int - 1), current_date, interval '1 day')::date as dia)
         select to_char(rango.dia,'YYYY-MM-DD') as dia, count(c.id)::int as total, count(*) filter (where c.resuelto)::int as resueltas, count(*) filter (where c.escalado)::int as escaladas
           from rango left join call_log c on c.tenant_id = $1 and (c.inicio at time zone 'UTC')::date = rango.dia group by rango.dia order by rango.dia`,
        [negocioId, dias],
      );
      const [tot] = await q(`select count(*)::int as total, count(*) filter (where resuelto)::int as resueltas, count(*) filter (where escalado)::int as escaladas, round(avg(duracion_seg))::int as duracion_promedio_seg, count(booking_id)::int as citas_generadas from call_log where tenant_id = $1 and inicio >= now() - ($2::int || ' days')::interval`, [negocioId, dias]);
      return { dias, resumen: tot, por_dia: porDia };
    }
    case "conversaciones":
      return q(
        `select v.id, v.canal, v.estado, v.motivo, v.resultado, v.resumen, v.creado, coalesce(c.nombre, v.contacto) as cliente
           from conversacion v left join cliente c on c.id = v.cliente_id where v.tenant_id = $1 order by v.creado desc limit $2`,
        [negocioId, Math.min(n("n", 10), 30)],
      );
    case "recados":
      return q(`select l.id, l.nombre, l.telefono, l.asunto, l.creado from lead l where l.tenant_id = $1 and not l.atendido order by l.creado desc limit 30`, [negocioId]);
    case "campanas":
      return q(
        `select k.id, k.nombre, k.tipo, k.canal, k.estado, k.creado,
                count(kc.id)::int as contactos,
                count(*) filter (where kc.estado in ('enviado','contestado','agendo','sin_respuesta','rechazo'))::int as enviados,
                count(*) filter (where kc.estado in ('contestado','agendo'))::int as contestaron,
                count(*) filter (where kc.estado = 'agendo')::int as agendaron
           from campana k left join campana_contacto kc on kc.campana_id = k.id where k.tenant_id = $1 group by k.id order by k.creado desc limit 20`,
        [negocioId],
      );
    case "equipo":
      return q(`select * from public.equipo_productividad($1, $2::date, $3::date)`, [negocioId, s("desde"), s("hasta") || s("desde")]);
    case "consulta_sql": {
      const sql = s("sql").replace(/;+\s*$/, "");
      if (!/^\s*(select|with)\b/i.test(sql) || /;/.test(sql) || /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|call|do)\b/i.test(sql))
        return { error: "solo se permiten consultas SELECT" };
      await q(`set local transaction_read_only = on`);
      await q(`set local statement_timeout = '5s'`);
      const filas = await q(`select * from (${sql}) t limit ${MAX_FILAS}`);
      return filas;
    }
    default:
      return { error: `herramienta desconocida: ${nombre}` };
  }
}

function formatearCita(f: Record<string, unknown>, zona: string) {
  const inicio = f.inicio ? new Date(String(f.inicio)) : null;
  return {
    ...f,
    inicio: inicio ? inicio.toISOString() : null,
    dia: inicio ? isoDia(inicio, zona) : null,
    hora: inicio ? hora(inicio.toISOString(), zona) : null,
    telefono: f.telefono ? formatearTelefono(String(f.telefono)) : null,
    cobrado: f.cobrado !== undefined && f.cobrado !== null ? moneda(String(f.cobrado)) : undefined,
  };
}

function armarPropuesta(c: Contexto, nombre: string, a: Record<string, string | number | null>): Propuesta {
  const s = (k: string) => String(a[k] ?? "").trim();
  const recurso = (id: string) => c.recursos.find((r) => r.id === id)?.nombre ?? id;
  const servicio = (id: string) => c.servicios.find((x) => x.id === id)?.nombre ?? id;
  switch (nombre) {
    case "proponer_campana":
      return { accion: "campana", args: a, resumen: `Crear la campaña «${s("nombre")}» por ${s("canal") === "llamada" ? "llamada" : "WhatsApp"} (${s("tipo")}): «${s("mensaje").slice(0, 140)}»` };
    case "proponer_bloqueo":
      return { accion: "bloqueo", args: a, resumen: `Bloquear a ${recurso(s("resource_id"))} del ${s("desde")}${s("hasta") && s("hasta") !== s("desde") ? ` al ${s("hasta")}` : ""}${s("motivo") ? ` (${s("motivo")})` : ""}` };
    case "proponer_cita":
      return { accion: "cita", args: a, resumen: `Agendar ${servicio(s("service_id"))} con ${recurso(s("resource_id"))} el ${s("inicio")} para ${s("cliente_nombre")} (${s("telefono")})` };
    case "proponer_cancelar_cita":
      return { accion: "cancelar_cita", args: a, resumen: `Cancelar la cita ${s("id").slice(0, 8)}…${s("motivo") ? ` (${s("motivo")})` : ""}` };
    case "proponer_atendida":
      return { accion: "atendida", args: a, resumen: `Marcar como atendida la cita ${s("id").slice(0, 8)}…` };
    case "proponer_cobro":
      return { accion: "cobro", args: a, resumen: `Registrar cobro de ${moneda(String(a.monto ?? 0))} en ${s("metodo")} por «${s("concepto")}»` };
    case "proponer_enlace_pago":
      return { accion: "enlace_pago", args: a, resumen: `Crear enlace de pago de ${moneda(String(a.monto ?? 0))} con ${s("proveedor")} por «${s("concepto")}» y mandarlo por WhatsApp` };
    default:
      throw new Error("propuesta desconocida");
  }
}
