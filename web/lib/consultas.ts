import { datos } from "@/lib/sesion";
import type { Faq, Negocio, Recurso, Regla, Reserva, Servicio } from "@/lib/tipos";

export function negocio(): Promise<Negocio> {
  return datos(async (q, id) => {
    const filas = await q<Negocio>("select * from tenant where id = $1", [id]);
    if (!filas[0]) throw new Error("Negocio no encontrado");
    return filas[0];
  });
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
         b.inicio, b.fin, b.estado, s.nombre as servicio, r.nombre as recurso,
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
