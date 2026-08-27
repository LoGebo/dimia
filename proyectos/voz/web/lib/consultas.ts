import "server-only";

import { datos } from "@/lib/sesion";
import type {
  CatalogoItem,
  Cliente,
  ClienteResumen,
  Evento,
  Conversacion,
  Mensaje,
  MensajeSaliente,
  Faq,
  Negocio,
  Pedido,
  PlantillaVertical,
  Recado,
  Recurso,
  Regla,
  Reserva,
  Servicio,
} from "@/lib/tipos";

export function negocio(): Promise<Negocio> {
  return datos(async (q, id) => {
    const filas = await q<Negocio>("select * from tenant where id = $1", [id]);
    if (!filas[0]) throw new Error("Negocio no encontrado");
    return filas[0];
  });
}

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
  return datos((q, id) =>
    q<CatalogoItem>(
      `select id, tipo, nombre, descripcion, precio, alias, atributos,
              resource_id, disponible, orden
         from catalogo_item where tenant_id = $1
        order by tipo, orden, nombre`,
      [id],
    ),
  );
}

export function recursos(): Promise<Recurso[]> {
  return datos((q, id) =>
    q<Recurso>(
      "select id, nombre, capacidad, metadatos, activo from resource where tenant_id = $1 order by nombre",
      [id],
    ),
  );
}

export function servicios(): Promise<Servicio[]> {
  return datos((q, id) =>
    q<Servicio>(
      `select id, nombre, alias, duracion_min, buffer_min, precio, recursos_validos, activo
         from service where tenant_id = $1 order by nombre`,
      [id],
    ),
  );
}

export function reglas(): Promise<Regla[]> {
  return datos((q, id) =>
    q<Regla>(
      `select id, resource_id, tipo, dia_semana, fecha,
              to_char(hora_inicio,'HH24:MI') as hora_inicio,
              to_char(hora_fin,'HH24:MI') as hora_fin
         from schedule_rule where tenant_id = $1
        order by dia_semana nulls last, fecha nulls last, hora_inicio`,
      [id],
    ),
  );
}

export function faq(): Promise<Faq[]> {
  return datos((q, id) =>
    q<Faq>(
      "select id, pregunta, respuesta, prioridad from knowledge where tenant_id = $1 order by prioridad desc, pregunta",
      [id],
    ),
  );
}

const SELECT_RESERVA = `
  select b.id, b.codigo, b.cliente_nombre, b.telefono, b.personas, b.notas,
         b.inicio, b.fin, b.estado, b.llegada, b.cliente_id, b.creado, s.precio,
         s.nombre as servicio, r.nombre as recurso,
         b.resource_id, b.service_id
    from booking b
    join service  s on s.id = b.service_id
    join resource r on r.id = b.resource_id`;

export function reservasEntre(desde: string, hasta: string): Promise<Reserva[]> {
  return datos((q, id) =>
    q<Reserva>(
      `${SELECT_RESERVA}
        where b.tenant_id = $1
          and b.inicio >= ($2::date)::timestamptz - interval '1 day'
          and b.inicio <  ($3::date)::timestamptz + interval '2 day'
        order by b.inicio`,
      [id, desde, hasta],
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

export type ResumenPedidos = {
  total: number;
  abiertos: number;
  confirmados: number;
  entregados: number;
  cancelados: number;
  vendido: number;
  ticket: number | null;
};

export function resumenPedidos(dia: string): Promise<ResumenPedidos> {
  return datos(async (q, id) => {
    const filas = await q<ResumenPedidos>(
      `with del_dia as (
         select p.id, p.estado, public.pedido_total(p.id) as total
           from pedido p
           join tenant t on t.id = p.tenant_id
          where p.tenant_id = $1
            and (p.creado at time zone t.zona_horaria)::date = $2::date
       ),
       vendidos as (select * from del_dia where estado in ('confirmado','entregado'))
       select (select count(*) from del_dia)::int as total,
              (select count(*) from del_dia where estado = 'abierto')::int as abiertos,
              (select count(*) from del_dia where estado = 'confirmado')::int as confirmados,
              (select count(*) from del_dia where estado = 'entregado')::int as entregados,
              (select count(*) from del_dia where estado = 'cancelado')::int as cancelados,
              (select coalesce(sum(total), 0) from vendidos)::float as vendido,
              (select avg(total) from vendidos)::float as ticket`,
      [id, dia],
    );
    return (
      filas[0] ?? {
        total: 0,
        abiertos: 0,
        confirmados: 0,
        entregados: 0,
        cancelados: 0,
        vendido: 0,
        ticket: null,
      }
    );
  });
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

/**
 * La bandeja: un renglón por conversación, ordenada por lo más reciente.
 *
 * Lee la vista previa denormalizada de `conversacion` a propósito: `mensaje`
 * crece sin límite y la bandeja se abre en cada carga del panel.
 */
export function conversaciones(limite = 50): Promise<Conversacion[]> {
  return datos((q, id) =>
    q<Conversacion>(
      `select id, canal, contacto, contacto_nombre, estado, escalada_en,
              motivo_escalamiento, ultimo_mensaje, ultimo_mensaje_en,
              mensajes_sin_leer, booking_id, pedido_id, call_id
         from conversacion
        where tenant_id = $1 and estado <> 'cerrada'
        order by ultimo_mensaje_en desc
        limit $2`,
      [id, limite],
    ),
  );
}

export function conversacion(conversacionId: string): Promise<Conversacion | null> {
  return datos(async (q, id) => {
    const filas = await q<Conversacion>(
      `select id, canal, contacto, contacto_nombre, estado, escalada_en,
              motivo_escalamiento, ultimo_mensaje, ultimo_mensaje_en,
              mensajes_sin_leer, booking_id, pedido_id, call_id
         from conversacion where id = $2 and tenant_id = $1`,
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

/** Cuántas conversaciones traen algo sin leer. Alimenta el punto del menú. */
export function conversacionesSinLeer(): Promise<number> {
  return datos(async (q, id) => {
    const filas = await q<{ n: string }>(
      `select count(*)::text as n from conversacion
        where tenant_id = $1 and mensajes_sin_leer > 0 and estado <> 'cerrada'`,
      [id],
    );
    return Number(filas[0]?.n ?? 0);
  });
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
         coalesce((select sum(public.pedido_total(p.id)) from pedido p where p.cliente_id = c.id and p.estado in ('confirmado','entregado')), 0)::text as gastado,
         (select count(*) from lead l where l.cliente_id = c.id and not l.atendido)::int as recados_pendientes
    from cliente c`;

export function clientes(segmento: SegmentoCliente, busqueda = "", limite = 200): Promise<ClienteResumen[]> {
  const condiciones: Record<SegmentoCliente, string> = {
    todos: "true",
    nuevos: "c.primer_contacto >= now() - interval '30 days'",
    frecuentes: "(select count(*) from booking b where b.cliente_id = c.id and b.estado = 'completada') >= 3",
    inactivos: "c.ultimo_contacto < now() - interval '90 days'",
    faltan: "(select count(*) from booking b where b.cliente_id = c.id and b.estado = 'no_asistio') >= 1",
  };
  const termino = busqueda.trim();
  return datos((q, id) =>
    q<ClienteResumen>(
      `${SELECT_CLIENTE}
        where c.tenant_id = $1
          and ${condiciones[segmento]}
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
      `select id, canal, contacto, contacto_nombre, estado, escalada_en,
              motivo_escalamiento, ultimo_mensaje, ultimo_mensaje_en,
              mensajes_sin_leer, booking_id, pedido_id, call_id
         from conversacion
        where tenant_id = $1 and cliente_id = $2
        order by ultimo_mensaje_en desc
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

export function eventosRecientes(limite = 40): Promise<(Evento & { cliente_nombre: string | null; cliente_telefono: string | null })[]> {
  return datos((q, id) =>
    q(
      `select e.id, e.cliente_id, e.tipo, e.entidad, e.entidad_id, e.datos, e.autor, e.creado,
              c.nombre as cliente_nombre, c.telefono as cliente_telefono
         from evento e
         left join cliente c on c.id = e.cliente_id
        where e.tenant_id = $1
        order by e.creado desc
        limit $2`,
      [id, limite],
    ),
  );
}
