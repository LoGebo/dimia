import "server-only";

import { cache } from "react";
import type { Consulta } from "@/lib/db";
import { datos } from "@/lib/sesion";
import type {
  Ausencia,
  Campana,
  CampanaContacto,
  CatalogoItem,
  Cliente,
  Linea,
  OrigenResumen,
  ResenaResumen,
  ClienteResumen,
  Evento,
  Conversacion,
  ConversacionDetalle,
  Mensaje,
  MensajeSaliente,
  Faq,
  Negocio,
  Pago,
  Pedido,
  Productividad,
  PlantillaVertical,
  Recado,
  Recurso,
  Regla,
  Reserva,
  Servicio,
} from "@/lib/tipos";

type Lector<T> = (q: Consulta, negocioId: string) => Promise<T>;

/**
 * Las lecturas de configuración del negocio, separadas de la sesión para que
 * `avance()` pueda correrlas todas en una sola transacción.
 */
export const leer = {
  negocio: (async (q, id) => {
    const filas = await q<Negocio>("select * from tenant where id = $1", [id]);
    if (!filas[0]) throw new Error("Negocio no encontrado");
    return filas[0];
  }) satisfies Lector<Negocio>,
  catalogo: ((q, id) =>
    q<CatalogoItem>(
      `select id, tipo, nombre, descripcion, precio, alias, atributos, existencias,
              resource_id, disponible, orden
         from catalogo_item where tenant_id = $1
        order by tipo, orden, nombre`,
      [id],
    )) satisfies Lector<CatalogoItem[]>,
  recursos: ((q, id) =>
    q<Recurso>(
      "select id, nombre, tipo, capacidad, telefono, correo, comision_pct::text as comision_pct, metadatos, activo from resource where tenant_id = $1 order by tipo desc, nombre",
      [id],
    )) satisfies Lector<Recurso[]>,
  servicios: ((q, id) =>
    q<Servicio>(
      `select id, nombre, alias, duracion_min, buffer_min, precio, recursos_validos, activo
         from service where tenant_id = $1 order by nombre`,
      [id],
    )) satisfies Lector<Servicio[]>,
  reglas: ((q, id) =>
    q<Regla>(
      `select id, resource_id, tipo, dia_semana, to_char(fecha, 'YYYY-MM-DD') as fecha,
              to_char(hora_inicio,'HH24:MI') as hora_inicio,
              to_char(hora_fin,'HH24:MI') as hora_fin
         from schedule_rule where tenant_id = $1
        order by dia_semana nulls last, fecha nulls last, hora_inicio`,
      [id],
    )) satisfies Lector<Regla[]>,
  faq: ((q, id) =>
    q<Faq>(
      "select id, pregunta, respuesta, prioridad from knowledge where tenant_id = $1 order by prioridad desc, pregunta",
      [id],
    )) satisfies Lector<Faq[]>,
};

/** Una vez por petición: casi todas las pantallas lo piden para la zona horaria. */
export const negocio = cache((): Promise<Negocio> => datos(leer.negocio));

export function plantillas(): Promise<PlantillaVertical[]> {
  return datos((q) =>
    q<PlantillaVertical>(
      "select clave, nombre, saludo, instrucciones, herramientas from vertical_template where activo order by nombre",
    ),
  );
}

export async function plantillaActual(vertical: string): Promise<PlantillaVertical | null> {
  const lista = await plantillas();
  return lista.find((p) => p.clave === vertical) ?? null;
}

export function catalogo(): Promise<CatalogoItem[]> {
  return datos(leer.catalogo);
}

export function recursos(): Promise<Recurso[]> {
  return datos(leer.recursos);
}

export function servicios(): Promise<Servicio[]> {
  return datos(leer.servicios);
}

export function reglas(): Promise<Regla[]> {
  return datos(leer.reglas);
}

export function faq(): Promise<Faq[]> {
  return datos(leer.faq);
}

const SELECT_RESERVA = `
  select b.id, b.codigo, b.cliente_nombre, b.telefono, b.personas, b.notas,
         b.inicio, b.fin, b.estado, b.llegada, b.cliente_id, b.creado, s.precio,
         s.nombre as servicio, r.nombre as recurso,
         b.resource_id, b.service_id, pg.cobrado::text as cobrado
    from booking b
    join service  s on s.id = b.service_id
    join resource r on r.id = b.resource_id
    left join lateral (
      select sum(g.monto) as cobrado from pago g
       where g.booking_id = b.id and g.estado = 'pagado'
    ) pg on true`;

/** Las citas de un rango de días, en la zona horaria del negocio. */
export function reservasEntre(desde: string, hasta: string): Promise<Reserva[]> {
  return datos((q, id) =>
    q<Reserva>(
      `${SELECT_RESERVA}
        join tenant t on t.id = b.tenant_id
        where b.tenant_id = $1
          and (b.inicio at time zone t.zona_horaria)::date between $2::date and $3::date
        order by b.inicio`,
      [id, desde, hasta],
    ),
  );
}

export function proximasReservas(despuesDe: string, limite = 8): Promise<Reserva[]> {
  return datos((q, id) =>
    q<Reserva>(
      `${SELECT_RESERVA}
        join tenant t on t.id = b.tenant_id
        where b.tenant_id = $1
          and b.estado = 'confirmada'
          and (b.inicio at time zone t.zona_horaria)::date > $2::date
        order by b.inicio
        limit $3`,
      [id, despuesDe, limite],
    ),
  );
}

export function buscarReservas(termino: string): Promise<Reserva[]> {
  const limpio = termino.trim();
  if (!limpio) return Promise.resolve([]);
  return datos((q, id) =>
    q<Reserva>(
      `${SELECT_RESERVA}
        where b.tenant_id = $1
          and (upper(b.codigo) = upper($2)
               or regexp_replace(b.telefono, '\\D', '', 'g') like '%' || regexp_replace($2, '\\D', '', 'g') || '%'
               or b.cliente_nombre ilike '%' || $2 || '%')
        order by b.inicio desc
        limit 40`,
      [id, limpio],
    ),
  );
}

export type LlamadasPorDia = { dia: string; total: number; resueltas: number; escaladas: number };
export type MotivoEscalamiento = { motivo: string; total: number };
export type ResumenLlamadas = {
  total: number;
  resueltas: number;
  escaladas: number;
  duracionPromedio: number | null;
  reservasGeneradas: number;
};

export function llamadasPorDia(dias: number): Promise<LlamadasPorDia[]> {
  return datos((q, id) =>
    q<LlamadasPorDia>(
      `with rango as (
         select generate_series(current_date - ($2::int - 1), current_date, interval '1 day')::date as dia
       )
       select to_char(rango.dia, 'YYYY-MM-DD') as dia,
              count(c.id)::int as total,
              count(*) filter (where c.resuelto)::int as resueltas,
              count(*) filter (where c.escalado)::int as escaladas
         from rango
         left join call_log c
           on c.tenant_id = $1 and (c.inicio at time zone 'UTC')::date = rango.dia
        group by rango.dia
        order by rango.dia`,
      [id, dias],
    ),
  );
}

export function resumenLlamadas(dias: number): Promise<ResumenLlamadas> {
  return datos(async (q, id) => {
    const filas = await q<ResumenLlamadas>(
      `select count(*)::int as total,
              count(*) filter (where resuelto)::int as resueltas,
              count(*) filter (where escalado)::int as escaladas,
              avg(duracion_seg)::float as "duracionPromedio",
              count(booking_id)::int as "reservasGeneradas"
         from call_log
        where tenant_id = $1 and inicio >= now() - make_interval(days => $2::int)`,
      [id, dias],
    );
    return filas[0] ?? { total: 0, resueltas: 0, escaladas: 0, duracionPromedio: null, reservasGeneradas: 0 };
  });
}

export function motivosEscalamiento(dias: number): Promise<MotivoEscalamiento[]> {
  return datos((q, id) =>
    q<MotivoEscalamiento>(
      `select coalesce(motivo_escalamiento, 'sin motivo') as motivo, count(*)::int as total
         from call_log
        where tenant_id = $1 and escalado
          and inicio >= now() - make_interval(days => $2::int)
        group by 1 order by 2 desc limit 8`,
      [id, dias],
    ),
  );
}

export type LlamadaPorHora = { hora: number; total: number };

export function llamadasPorHora(dias: number): Promise<LlamadaPorHora[]> {
  return datos((q, id) =>
    q<LlamadaPorHora>(
      `select extract(hour from inicio at time zone t.zona_horaria)::int as hora, count(*)::int as total
         from call_log c join tenant t on t.id = c.tenant_id
        where c.tenant_id = $1 and c.inicio >= now() - make_interval(days => $2::int)
        group by 1 order by 1`,
      [id, dias],
    ),
  );
}

const SELECT_PEDIDO = `
  select p.id, p.codigo, p.cliente_nombre, p.telefono, p.tipo, p.direccion,
         p.notas, p.estado, p.creado, p.listo_para,
         coalesce(r->>'total', '0') as total,
         coalesce(r->'items', '[]'::jsonb) as items
    from pedido p
    join tenant t on t.id = p.tenant_id
    cross join lateral public.pedido_resumen(p.tenant_id, p.id) as r`;

export function pedidosDelDia(dia: string): Promise<Pedido[]> {
  return datos((q, id) =>
    q<Pedido>(
      `${SELECT_PEDIDO}
        where p.tenant_id = $1
          and (p.creado at time zone t.zona_horaria)::date = $2::date
        order by p.creado desc`,
      [id, dia],
    ),
  );
}

export function recados(soloPendientes: boolean): Promise<Recado[]> {
  return datos((q, id) =>
    q<Recado>(
      `select id, nombre, telefono, asunto, detalle, campos, atendido, creado
         from lead
        where tenant_id = $1 and ($2::boolean is false or not atendido)
        order by atendido, creado desc
        limit 200`,
      [id, soloPendientes],
    ),
  );
}

export function recadosPendientes(): Promise<number> {
  return datos(async (q, id) => {
    const filas = await q<{ total: number }>(
      "select count(*)::int as total from lead where tenant_id = $1 and not atendido",
      [id],
    );
    return filas[0]?.total ?? 0;
  });
}

/** Cuántas citas confirmadas o atendidas hubo un día. Sirve para comparar contra la semana pasada. */
export function citasDelDia(dia: string): Promise<number> {
  return datos(async (q, id) => {
    const filas = await q<{ n: string }>(
      `select count(*)::text as n
         from booking b
         join tenant t on t.id = b.tenant_id
        where b.tenant_id = $1
          and b.estado in ('confirmada','completada')
          and (b.inicio at time zone t.zona_horaria)::date = $2::date`,
      [id, dia],
    );
    return Number(filas[0]?.n ?? 0);
  });
}

/** Los contadores del menú y de la campana: lo que pide atención ahora mismo. */
export type Contadores = { bandeja: number; pedidos: number; recados: number };

export function contadores(): Promise<Contadores> {
  return datos(async (q, id) => {
    const filas = await q<{ bandeja: number; pedidos: number; recados: number }>(
      `select (select count(*) from conversacion
                where tenant_id = $1 and mensajes_sin_leer > 0 and estado <> 'cerrada')::int as bandeja,
              (select count(*) from pedido
                where tenant_id = $1 and estado in ('abierto','confirmado'))::int as pedidos,
              (select count(*) from lead
                where tenant_id = $1 and not atendido)::int as recados`,
      [id],
    );
    return filas[0] ?? { bandeja: 0, pedidos: 0, recados: 0 };
  });
}

export type ResumenAgendaHoy = { confirmadas: number; canceladas: number; personas: number };

export function resumenAgendaHoy(dia: string): Promise<ResumenAgendaHoy> {
  return datos(async (q, id) => {
    const filas = await q<ResumenAgendaHoy>(
      `select count(*) filter (where b.estado = 'confirmada')::int as confirmadas,
              count(*) filter (where b.estado = 'cancelada')::int as canceladas,
              coalesce(sum(b.personas) filter (where b.estado = 'confirmada'), 0)::int as personas
         from booking b
         join tenant t on t.id = b.tenant_id
        where b.tenant_id = $1 and (b.inicio at time zone t.zona_horaria)::date = $2::date`,
      [id, dia],
    );
    return filas[0] ?? { confirmadas: 0, canceladas: 0, personas: 0 };
  });
}

const SELECT_CONVERSACION = `
  select c.id, c.canal, c.contacto, c.contacto_nombre, c.cliente_id, c.estado, c.escalada_en,
         c.motivo_escalamiento, c.motivo, c.resultado, c.resumen, c.ultimo_mensaje, c.ultimo_mensaje_en,
         c.mensajes_sin_leer, c.booking_id, c.pedido_id, c.call_id
    from conversacion c`;

/**
 * La bandeja: un renglón por conversación, ordenada por lo más reciente.
 *
 * Lee la vista previa denormalizada de `conversacion` a propósito: `mensaje`
 * crece sin límite y la bandeja se abre en cada carga del panel.
 */
export function conversaciones(limite = 50): Promise<Conversacion[]> {
  return datos((q, id) =>
    q<Conversacion>(
      `${SELECT_CONVERSACION}
        where c.tenant_id = $1 and c.estado <> 'cerrada'
        order by c.ultimo_mensaje_en desc
        limit $2`,
      [id, limite],
    ),
  );
}

export function conversacion(conversacionId: string): Promise<ConversacionDetalle | null> {
  return datos(async (q, id) => {
    const filas = await q<ConversacionDetalle>(
      `select x.*, b.codigo as booking_codigo, b.inicio as booking_inicio, p.creado as pedido_creado
         from (${SELECT_CONVERSACION} where c.id = $2 and c.tenant_id = $1) x
         left join booking b on b.id = x.booking_id
         left join pedido p on p.id = x.pedido_id`,
      [id, conversacionId],
    );
    return filas[0] ?? null;
  });
}

export function mensajes(conversacionId: string, limite = 200): Promise<Mensaje[]> {
  return datos((q, id) =>
    q<Mensaje>(
      `select id, autor, texto, herramienta, creado
         from mensaje
        where tenant_id = $1 and conversacion_id = $2
        order by creado
        limit $3`,
      [id, conversacionId, limite],
    ),
  );
}

/**
 * Lo que salió y lo que no. La cola es del sistema, pero cada negocio solo ve
 * lo suyo: RLS filtra por tenant.
 */
export function mensajesSalientes(limite = 100): Promise<MensajeSaliente[]> {
  return datos((q, id) =>
    q<MensajeSaliente>(
      `select id, canal, destino, plantilla::text as plantilla, estado::text as estado,
              intentos, max_intentos, ultimo_error, disponible_en, creado, enviado
         from outbox
        where tenant_id = $1
        order by creado desc
        limit $2`,
      [id, limite],
    ),
  );
}

// ---------------------------------------------------------------
// Clientes: la memoria del negocio.
// ---------------------------------------------------------------

export type SegmentoCliente = "todos" | "nuevos" | "frecuentes" | "inactivos" | "faltan";

const SELECT_CLIENTE = `
  select c.id, c.nombre, c.telefono, c.correo, c.notas, c.origen, c.etiquetas,
         c.primer_contacto, c.ultimo_contacto,
         (select count(*) from booking b where b.cliente_id = c.id and b.estado in ('confirmada','completada'))::int as citas,
         (select count(*) from booking b where b.cliente_id = c.id and b.estado = 'completada')::int as atendidas,
         (select count(*) from booking b where b.cliente_id = c.id and b.estado = 'no_asistio')::int as no_asistio,
         (select count(*) from pedido p where p.cliente_id = c.id and p.estado in ('confirmado','entregado'))::int as pedidos,
         coalesce((select sum(g.monto) from pago g where g.cliente_id = c.id and g.estado = 'pagado'), 0)::text as gastado,
         (select count(*) from lead l where l.cliente_id = c.id and not l.atendido)::int as recados_pendientes
    from cliente c`;

/**
 * Qué es cada segmento, en SQL sobre el alias `c` de cliente. Lo leen la
 * pantalla de clientes y «Agregar personas» de campañas: un solo criterio.
 * Frecuente es quien ya volvió tres veces, sea a una cita o por un pedido.
 */
export const CONDICION_SEGMENTO: Record<SegmentoCliente, string> = {
  todos: "true",
  nuevos: "c.primer_contacto >= now() - interval '30 days'",
  frecuentes: `((select count(*) from booking b where b.cliente_id = c.id and b.estado = 'completada')
               + (select count(*) from pedido p where p.cliente_id = c.id and p.estado = 'entregado')) >= 3`,
  inactivos: "c.ultimo_contacto < now() - interval '90 days'",
  faltan: "exists (select 1 from booking b where b.cliente_id = c.id and b.estado = 'no_asistio')",
};

export function clientes(segmento: SegmentoCliente, busqueda = "", limite = 200): Promise<ClienteResumen[]> {
  const termino = busqueda.trim();
  return datos((q, id) =>
    q<ClienteResumen>(
      `${SELECT_CLIENTE}
        where c.tenant_id = $1
          and ${CONDICION_SEGMENTO[segmento]}
          and ($2 = '' or c.nombre ilike '%' || $2 || '%'
               or regexp_replace(coalesce(c.telefono,''), '\\D', '', 'g') like '%' || regexp_replace($2, '\\D', '', 'g') || '%')
        order by c.ultimo_contacto desc
        limit $3`,
      [id, termino, limite],
    ),
  );
}

export function cliente(clienteId: string): Promise<ClienteResumen | null> {
  return datos(async (q, id) => {
    const filas = await q<ClienteResumen>(`${SELECT_CLIENTE} where c.tenant_id = $1 and c.id = $2`, [id, clienteId]);
    return filas[0] ?? null;
  });
}

export function eventosDeCliente(clienteId: string, limite = 100): Promise<Evento[]> {
  return datos((q, id) =>
    q<Evento>(
      `select id, cliente_id, tipo, entidad, entidad_id, datos, autor, creado
         from evento
        where tenant_id = $1 and cliente_id = $2
        order by creado desc
        limit $3`,
      [id, clienteId, limite],
    ),
  );
}

export function reservasDeCliente(clienteId: string, limite = 30): Promise<Reserva[]> {
  return datos((q, id) =>
    q<Reserva>(`${SELECT_RESERVA} where b.tenant_id = $1 and b.cliente_id = $2 order by b.inicio desc limit $3`, [
      id,
      clienteId,
      limite,
    ]),
  );
}

export function conversacionesDeCliente(clienteId: string): Promise<Conversacion[]> {
  return datos((q, id) =>
    q<Conversacion>(
      `${SELECT_CONVERSACION}
        where c.tenant_id = $1 and c.cliente_id = $2
        order by c.ultimo_mensaje_en desc
        limit 20`,
      [id, clienteId],
    ),
  );
}

export type ResumenClientes = { total: number; nuevos30: number; inactivos90: number; faltan: number };

export function resumenClientes(): Promise<ResumenClientes> {
  return datos(async (q, id) => {
    const filas = await q<ResumenClientes>(
      `select count(*)::int as total,
              count(*) filter (where primer_contacto >= now() - interval '30 days')::int as nuevos30,
              count(*) filter (where ultimo_contacto < now() - interval '90 days')::int as inactivos90,
              (select count(distinct cliente_id) from booking b where b.tenant_id = $1 and b.estado = 'no_asistio')::int as faltan
         from cliente where tenant_id = $1`,
      [id],
    );
    return filas[0] ?? { total: 0, nuevos30: 0, inactivos90: 0, faltan: 0 };
  });
}

// ---------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------

const SELECT_PAGO = `
  select g.id, g.cliente_id, c.nombre as cliente_nombre, g.booking_id, g.pedido_id, g.concepto,
         g.monto::text as monto, g.metodo, g.estado, g.proveedor, g.enlace_url, g.referencia_externa,
         g.notas, g.pagado_en, g.creado
    from pago g
    left join cliente c on c.id = g.cliente_id`;

export function pagosDelDia(dia: string): Promise<Pago[]> {
  return datos((q, id) =>
    q<Pago>(
      `${SELECT_PAGO}
        join tenant t on t.id = g.tenant_id
       where g.tenant_id = $1
         and (coalesce(g.pagado_en, g.creado) at time zone t.zona_horaria)::date = $2::date
       order by coalesce(g.pagado_en, g.creado) desc`,
      [id, dia],
    ),
  );
}

export function pagosPendientes(): Promise<Pago[]> {
  return datos((q, id) =>
    q<Pago>(`${SELECT_PAGO} where g.tenant_id = $1 and g.estado = 'pendiente' order by g.creado desc limit 100`, [id]),
  );
}

export function pagosDePedidos(ids: string[]): Promise<Pago[]> {
  if (ids.length === 0) return Promise.resolve([]);
  return datos((q, id) =>
    q<Pago>(`${SELECT_PAGO} where g.tenant_id = $1 and g.pedido_id = any($2::uuid[]) and g.estado <> 'cancelado'`, [id, ids]),
  );
}

export type ResumenCobros = { cobrado: string; operaciones: number; pendiente: string; por_metodo: { metodo: string; monto: string }[] };

export function resumenCobros(dia: string): Promise<ResumenCobros> {
  return datos(async (q, id) => {
    const filas = await q<{ cobrado: string; operaciones: number; pendiente: string; por_metodo: { metodo: string; monto: string }[] | null }>(
      `with del_dia as (
         select g.* from pago g join tenant t on t.id = g.tenant_id
          where g.tenant_id = $1 and (coalesce(g.pagado_en, g.creado) at time zone t.zona_horaria)::date = $2::date
       )
       select coalesce(sum(monto) filter (where estado = 'pagado'), 0)::text as cobrado,
              count(*) filter (where estado = 'pagado')::int as operaciones,
              (select coalesce(sum(monto), 0)::text from pago where tenant_id = $1 and estado = 'pendiente') as pendiente,
              (select jsonb_agg(jsonb_build_object('metodo', metodo, 'monto', total::text) order by total desc)
                 from (select metodo, sum(monto) as total from del_dia where estado = 'pagado' group by metodo) m) as por_metodo
         from del_dia`,
      [id, dia],
    );
    const f = filas[0];
    return { cobrado: f?.cobrado ?? "0", operaciones: f?.operaciones ?? 0, pendiente: f?.pendiente ?? "0", por_metodo: f?.por_metodo ?? [] };
  });
}

// ---------------------------------------------------------------
// Campañas
// ---------------------------------------------------------------

const SELECT_CAMPANA = `
  select ca.id, ca.nombre, ca.tipo, ca.canal, ca.estado, ca.criterio, ca.mensaje, ca.objetivo,
         ca.ventana_inicio::text as ventana_inicio, ca.ventana_fin::text as ventana_fin, ca.max_intentos, ca.creado,
         r.total, r.pendientes, r.enviados, r.contestados, r.agendaron, r.sin_respuesta, r.fallidos
    from campana ca
    cross join lateral public.campana_resumen(ca.id) r`;

export function campanas(): Promise<Campana[]> {
  return datos((q, id) => q<Campana>(`${SELECT_CAMPANA} where ca.tenant_id = $1 order by ca.creado desc`, [id]));
}

export function campana(campanaId: string): Promise<Campana | null> {
  return datos(async (q, id) => {
    const filas = await q<Campana>(`${SELECT_CAMPANA} where ca.tenant_id = $1 and ca.id = $2`, [id, campanaId]);
    return filas[0] ?? null;
  });
}

export function contactosDeCampana(campanaId: string): Promise<CampanaContacto[]> {
  return datos((q, id) =>
    q<CampanaContacto>(
      `select cc.id, cc.cliente_id, c.nombre as cliente_nombre, c.telefono as cliente_telefono,
              cc.estado, cc.intentos, cc.ultimo_intento, cc.siguiente_intento, cc.resultado, cc.booking_id
         from campana_contacto cc
         join cliente c on c.id = cc.cliente_id
        where cc.tenant_id = $1 and cc.campana_id = $2
        order by case cc.estado when 'agendo' then 0 when 'contestado' then 1 when 'en_curso' then 2 when 'pendiente' then 3 else 4 end,
                 cc.actualizado desc
        limit 500`,
      [id, campanaId],
    ),
  );
}

/** Cuántas personas alcanzaría una campaña con este criterio, antes de crearla. */
export function alcanceCampana(tipo: string, dias: number): Promise<number> {
  return datos(async (q, id) => {
    const sql: Record<string, string> = {
      no_show: `select count(distinct b.cliente_id)::int as n from booking b
                 where b.tenant_id = $1 and b.estado = 'no_asistio' and b.cliente_id is not null
                   and b.inicio >= now() - make_interval(days => $2)
                   and not exists (select 1 from booking f where f.cliente_id = b.cliente_id and f.estado = 'confirmada' and f.inicio > now())`,
      inactivos: `select count(*)::int as n from cliente c
                   where c.tenant_id = $1 and c.telefono is not null and c.ultimo_contacto < now() - make_interval(days => $2)
                     and exists (select 1 from booking b where b.cliente_id = c.id and b.estado = 'completada')`,
      recordatorio_pago: `select count(distinct cliente_id)::int as n from pago where tenant_id = $1 and estado = 'pendiente' and cliente_id is not null`,
    };
    const consulta = sql[tipo];
    if (!consulta) return 0;
    const filas = await q<{ n: number }>(consulta, consulta.includes("$2") ? [id, dias] : [id]);
    return filas[0]?.n ?? 0;
  });
}

// ---------------------------------------------------------------
// Equipo
// ---------------------------------------------------------------

export function productividadEquipo(desde: string, hasta: string): Promise<Productividad[]> {
  return datos((q, id) =>
    q<Productividad>(
      `select resource_id, nombre, tipo, comision_pct::text as comision_pct, citas, atendidas, no_asistio,
              cobrado::text as cobrado, comision::text as comision
         from public.equipo_productividad($1, $2::date, $3::date)`,
      [id, desde, hasta],
    ),
  );
}

export function ausencias(): Promise<Ausencia[]> {
  return datos((q, id) =>
    q<Ausencia>(
      `select id, resource_id, fecha::text as fecha, hora_inicio::text as hora_inicio, hora_fin::text as hora_fin, motivo
         from schedule_rule
        where tenant_id = $1 and tipo = 'bloqueo' and fecha is not null and fecha >= current_date - 7
        order by fecha, resource_id`,
      [id],
    ),
  );
}

// ---------------------------------------------------------------
// Reseñas, origen y líneas
// ---------------------------------------------------------------

export function resenasResumen(dias: number): Promise<ResenaResumen[]> {
  return datos((q, id) =>
    q<ResenaResumen>(`select resource_id, nombre, total, promedio::text as promedio, bajas from public.resenas_resumen($1, $2)`, [id, dias]),
  );
}

export function clientesPorOrigen(dias: number): Promise<OrigenResumen[]> {
  return datos((q, id) =>
    q<OrigenResumen>(`select origen, clientes, citas, cobrado::text as cobrado from public.clientes_por_origen($1, $2)`, [id, dias]),
  );
}

export function lineas(): Promise<Linea[]> {
  return datos((q, id) =>
    q<Linea>("select id, telefono, etiqueta, campana_id, activo from linea where tenant_id = $1 order by creado", [id]),
  );
}

// ---------------------------------------------------------------
// Hoy: lo que necesita atención ahora mismo
// ---------------------------------------------------------------

export type AlertasHoy = {
  retrasadas: number;
  escaladas: number;
  recados: number;
  cobros_pendientes: number;
  cobros_monto: string;
  campanas_contestaron: number;
  por_cobrar_atendidas: number;
  mensajes_sin_leer: number;
};

export function alertasHoy(): Promise<AlertasHoy> {
  return datos(async (q, id) => {
    const filas = await q<AlertasHoy>(
      `select
         (select count(*) from booking b where b.tenant_id = $1 and b.estado = 'confirmada' and b.llegada is null
             and b.inicio < now() - interval '15 minutes' and b.inicio > now() - interval '12 hours')::int as retrasadas,
         (select count(*) from conversacion c where c.tenant_id = $1 and c.estado = 'escalada')::int as escaladas,
         (select count(*) from lead l where l.tenant_id = $1 and not l.atendido)::int as recados,
         (select count(*) from pago g where g.tenant_id = $1 and g.estado = 'pendiente')::int as cobros_pendientes,
         (select coalesce(sum(monto), 0)::text from pago g where g.tenant_id = $1 and g.estado = 'pendiente') as cobros_monto,
         (select count(*) from campana_contacto cc where cc.tenant_id = $1 and cc.estado = 'contestado' and cc.actualizado >= now() - interval '24 hours')::int as campanas_contestaron,
         (select count(*) from booking b join tenant t on t.id = b.tenant_id
           where b.tenant_id = $1 and b.estado = 'completada' and (b.inicio at time zone t.zona_horaria)::date = (now() at time zone t.zona_horaria)::date
             and not exists (select 1 from pago g where g.booking_id = b.id and g.estado <> 'cancelado'))::int as por_cobrar_atendidas,
         (select coalesce(sum(mensajes_sin_leer), 0) from conversacion c where c.tenant_id = $1 and c.estado <> 'cerrada')::int as mensajes_sin_leer`,
      [id],
    );
    return filas[0] ?? { retrasadas: 0, escaladas: 0, recados: 0, cobros_pendientes: 0, cobros_monto: "0", campanas_contestaron: 0, por_cobrar_atendidas: 0, mensajes_sin_leer: 0 };
  });
}

export type CobroPorDia = { dia: string; cobrado: string; operaciones: number };

/** Lo cobrado cada día de los últimos `dias`, incluidos los días en cero. */
export function cobrosPorDia(dias: number): Promise<CobroPorDia[]> {
  return datos((q, id) =>
    q<CobroPorDia>(
      `with t as (select zona_horaria from tenant where id = $1),
       rango as (
         select generate_series(
           (now() at time zone (select zona_horaria from t))::date - ($2::int - 1),
           (now() at time zone (select zona_horaria from t))::date,
           interval '1 day')::date as dia
       )
       select to_char(rango.dia, 'YYYY-MM-DD') as dia,
              coalesce(sum(g.monto) filter (where g.estado = 'pagado'), 0)::text as cobrado,
              count(g.id) filter (where g.estado = 'pagado')::int as operaciones
         from rango
         left join pago g
           on g.tenant_id = $1
          and (coalesce(g.pagado_en, g.creado) at time zone (select zona_horaria from t))::date = rango.dia
        group by rango.dia
        order by rango.dia`,
      [id, dias],
    ),
  );
}
