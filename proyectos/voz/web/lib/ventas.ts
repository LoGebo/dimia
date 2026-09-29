import "server-only";

import { datos } from "@/lib/sesion";

/** Ventas, fase 1: interesados reales (tabla interesado + sus mensajes y eventos). */

export type Etapa = "nuevo" | "contactado" | "en_conversacion" | "requiere_persona" | "cita" | "asistio" | "vendido" | "perdido" | "baja";
export type Grupo = "persona" | "nuevo" | "seguimiento" | "cita" | "perdido";

export const GRUPO_DE: Record<Etapa, Grupo> = {
  requiere_persona: "persona", nuevo: "nuevo", contactado: "nuevo", en_conversacion: "seguimiento",
  cita: "cita", asistio: "cita", vendido: "cita", perdido: "perdido", baja: "perdido",
};

export type EventoHilo = { hora: string; quien: "agente" | "interesado" | "sistema" | "equipo"; texto: string; seguimiento?: boolean };

export type InteresadoReal = {
  id: string;
  nombre: string;
  contacto: string;
  canal: string;
  origen: string | null;
  etapa: Etapa;
  grupo: Grupo;
  conversacionId: string | null;
  lectura: string | null;
  tomado: boolean;
  paso: number;
  proxima: string | null;
  creado: string;
  primerToqueSeg: number | null;
  consentimiento: string | null;
  hilo: EventoHilo[];
  decision: { id: string; pregunta: string; opciones: { letra: string; titulo: string; mensaje: string }[] } | null;
};

export type Resumen = { activos: number; seguimientos: number; hoy: number; citasHoy: number; p50: number | null; proximo: { nombre: string; en: string } | null };

const TEXTO_EVENTO: Record<string, (d: Record<string, unknown>) => string> = {
  creado: () => "Llegó un mensaje nuevo",
  primer_toque: (d) => `Contestó en ${d.segundos ?? "?"} s`,
  requiere_persona: (d) => `Pasado a una persona${d.motivo ? `: ${d.motivo}` : ""}`,
  cita: () => "Agendó cita",
  baja: () => "Pidió no recibir más mensajes: seguimiento detenido",
  perdido: () => "Sin respuesta después del último seguimiento",
  tomado: () => "Usted tomó la conversación",
  devuelto: () => "Usted se la devolvió al agente",
  resultado: (d) => `Resultado: ${d.resultado ?? ""}`,
};

export function interesados(): Promise<{ lista: InteresadoReal[]; resumen: Resumen }> {
  return datos(async (q, negocioId) => {
    const filas = await q<{
      id: string; nombre: string | null; contacto: string; canal: string; origen: string | null; etapa: Etapa;
      conversacion_id: string | null; lectura: string | null; tomado_por_persona: boolean; paso: number;
      proxima_accion_en: string | null; creado: string; primer_toque_en: string | null; consentimiento: string | null;
    }>(
      `select i.id, i.nombre, i.contacto, i.canal, i.origen, i.etapa, i.conversacion_id, i.lectura, i.tomado_por_persona,
              i.paso, i.proxima_accion_en, i.creado, i.primer_toque_en,
              (select c.evidencia || ' · ' || to_char(c.otorgado_en at time zone 'America/Mexico_City', 'DD-MM HH24:MI')
                 from consentimiento c where c.tenant_id = i.tenant_id and c.contacto = i.contacto and c.revocado_en is null
                order by c.otorgado_en desc limit 1) as consentimiento
         from interesado i
        where i.tenant_id = $1 and i.creado >= now() - interval '30 days'
        order by case i.etapa when 'requiere_persona' then 0 when 'nuevo' then 1 when 'contactado' then 1
                              when 'en_conversacion' then 2 when 'cita' then 3 else 4 end, i.actualizado desc
        limit 150`,
      [negocioId],
    );
    const ids = filas.map((f) => f.id);
    const convs = filas.map((f) => f.conversacion_id).filter(Boolean) as string[];
    const decisiones = ids.length
      ? await q<{ id: string; interesado_id: string; pregunta: string; opciones: { letra: string; titulo: string; mensaje: string }[] }>(
          "select id, interesado_id, pregunta, opciones from decision_dueno where interesado_id = any($1::uuid[]) and elegida is null", [ids])
      : [];
    const [mensajes, eventos, resumen] = await Promise.all([
      convs.length
        ? q<{ conversacion_id: string; autor: string; texto: string; creado: string; herramienta: string | null }>(
            `select conversacion_id, autor::text, texto, creado, herramienta from (
               select m.*, row_number() over (partition by conversacion_id order by creado desc) n
                 from mensaje m where m.conversacion_id = any($1::uuid[]) and m.texto is not null) x
              where n <= 40 order by creado`, [convs])
        : Promise.resolve([]),
      ids.length
        ? q<{ interesado_id: string; tipo: string; detalle: Record<string, unknown>; creado: string }>(
            `select interesado_id, tipo, detalle, creado from interesado_evento
              where interesado_id = any($1::uuid[]) and tipo <> 'contesto' and tipo <> 'seguimiento' order by creado`, [ids])
        : Promise.resolve([]),
      q<{ activos: number; seguimientos: number; hoy: number; citas_hoy: number; p50: number | null; proximo_nombre: string | null; proximo_en: string | null }>(
        `select count(*) filter (where etapa in ('nuevo','contactado','en_conversacion','requiere_persona'))::int as activos,
                count(*) filter (where proxima_accion_en is not null and not tomado_por_persona)::int as seguimientos,
                count(*) filter (where creado >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')::int as hoy,
                (select count(*) from interesado_evento e where e.tenant_id = $1 and e.tipo = 'cita'
                   and e.creado >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City')::int as citas_hoy,
                (select percentile_cont(0.5) within group (order by (e.detalle->>'segundos')::numeric)
                   from interesado_evento e where e.tenant_id = $1 and e.tipo = 'primer_toque' and e.creado >= now() - interval '7 days') as p50,
                (select coalesce(nombre, contacto) from interesado x where x.tenant_id = $1 and x.proxima_accion_en is not null
                   and not x.tomado_por_persona order by x.proxima_accion_en limit 1) as proximo_nombre,
                (select proxima_accion_en from interesado x where x.tenant_id = $1 and x.proxima_accion_en is not null
                   and not x.tomado_por_persona order by x.proxima_accion_en limit 1) as proximo_en
           from interesado where tenant_id = $1 and creado >= now() - interval '30 days'`, [negocioId]),
    ]);

    const hora = (t: string) => new Date(t).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const lista: InteresadoReal[] = filas.map((f) => {
      const hilo: (EventoHilo & { t: number })[] = [
        ...mensajes.filter((m) => m.conversacion_id === f.conversacion_id).map((m) => ({
          t: +new Date(m.creado), hora: hora(m.creado), texto: m.texto, seguimiento: m.herramienta === "seguimiento",
          quien: (m.autor === "cliente" ? "interesado" : m.autor === "equipo" ? "equipo" : m.autor === "sistema" ? "sistema" : "agente") as EventoHilo["quien"],
        })),
        ...eventos.filter((e) => e.interesado_id === f.id && TEXTO_EVENTO[e.tipo]).map((e) => ({
          t: +new Date(e.creado), hora: hora(e.creado), quien: "sistema" as const, texto: TEXTO_EVENTO[e.tipo]!(e.detalle ?? {}),
        })),
      ].sort((a, b) => a.t - b.t);
      return {
        id: f.id, nombre: f.nombre?.trim() || f.contacto, contacto: f.contacto, canal: f.canal, origen: f.origen, etapa: f.etapa,
        grupo: GRUPO_DE[f.etapa], conversacionId: f.conversacion_id, lectura: f.lectura, tomado: f.tomado_por_persona, paso: f.paso,
        proxima: f.proxima_accion_en, creado: f.creado,
        primerToqueSeg: f.primer_toque_en ? Math.round((+new Date(f.primer_toque_en) - +new Date(f.creado)) / 1000) : null,
        consentimiento: f.consentimiento, hilo: hilo.map(({ t: _t, ...h }) => h),
        decision: (() => { const d = decisiones.find((x) => x.interesado_id === f.id); return d ? { id: d.id, pregunta: d.pregunta, opciones: d.opciones } : null; })(),
      };
    });
    const r = resumen[0]!;
    return {
      lista,
      resumen: {
        activos: r.activos, seguimientos: r.seguimientos, hoy: r.hoy, citasHoy: r.citas_hoy,
        p50: r.p50 === null ? null : Math.round(Number(r.p50)),
        proximo: r.proximo_nombre && r.proximo_en ? { nombre: r.proximo_nombre, en: r.proximo_en } : null,
      },
    };
  });
}

export type PasoSeguimiento = { horas: number; mensaje: string };
export type ConfigSeguimiento = {
  activo: boolean; nivel: "suave" | "normal" | "insistente" | "propio"; dias: "lun-vie" | "lun-sab" | "todos";
  hora_inicio: string; hora_fin: string; objetivo: string; trato: "usted" | "tu"; preguntas: string[]; escalar: string[];
  pasos: PasoSeguimiento[] | null;
};

/** La configuración del negocio y los pasos de cada nivel (salen de la misma función SQL que usa el motor). */
export function seguimiento(): Promise<{ config: ConfigSeguimiento; niveles: Record<string, Record<"usted" | "tu", PasoSeguimiento[]>> }> {
  return datos(async (q, negocioId) => {
    const [fila] = await q<ConfigSeguimiento>(
      `select activo, nivel, dias, to_char(hora_inicio, 'HH24:MI') hora_inicio, to_char(hora_fin, 'HH24:MI') hora_fin,
              objetivo, trato, preguntas, escalar, pasos
         from seguimiento_config where tenant_id = $1`, [negocioId]);
    const niveles = await q<{ nivel: string; trato: "usted" | "tu"; pasos: PasoSeguimiento[] }>(
      `select n.nivel, t.trato,
              public.seguimiento_pasos(row($1::uuid, false, n.nivel, '{}'::jsonb, 'lun-sab', '09:00'::time, '20:00'::time,
                                           'agendar', t.trato, '[]'::jsonb, '[]'::jsonb, null, now())::seguimiento_config) as pasos
         from (values ('suave'), ('normal'), ('insistente')) n(nivel), (values ('usted'), ('tu')) t(trato)`, [negocioId]);
    const mapa: Record<string, Record<"usted" | "tu", PasoSeguimiento[]>> = {};
    for (const n of niveles) (mapa[n.nivel] ??= { usted: [], tu: [] })[n.trato] = n.pasos;
    return {
      config: fila ?? {
        activo: false, nivel: "normal", dias: "lun-sab", hora_inicio: "09:00", hora_fin: "20:00", objetivo: "agendar", trato: "usted",
        preguntas: ["¿Qué servicio busca?", "¿Para cuándo lo necesita?"],
        escalar: ["Pregunta un precio fuera del catálogo", "Se molesta o se queja", "Pide hablar con una persona"], pasos: null,
      },
      niveles: mapa,
    };
  });
}

export type ResultadosVentas = {
  interesados: number; contactados: number; contestaron: number; conCita: number; perdidos: number; bajas: number; porPersona: number;
  p50: number | null; p90: number | null; porCanal: { canal: string; citas: number; interesados: number }[];
};

export function resultados(dias = 30): Promise<ResultadosVentas> {
  return datos(async (q, negocioId) => {
    const [r] = await q<{
      interesados: number; contactados: number; contestaron: number; con_cita: number; perdidos: number; bajas: number; por_persona: number;
      p50: number | null; p90: number | null;
    }>(
      `with i as (select * from interesado where tenant_id = $1 and creado >= now() - make_interval(days => $2))
       select count(*)::int interesados,
              count(*) filter (where primer_toque_en is not null)::int contactados,
              count(*) filter (where ultimo_mensaje_cliente_en > primer_toque_en or etapa in ('en_conversacion','cita','asistio','vendido'))::int contestaron,
              count(*) filter (where etapa in ('cita','asistio','vendido'))::int con_cita,
              count(*) filter (where etapa = 'perdido')::int perdidos,
              count(*) filter (where etapa = 'baja')::int bajas,
              count(*) filter (where etapa = 'requiere_persona')::int por_persona,
              percentile_cont(0.5) within group (order by extract(epoch from primer_toque_en - creado)) p50,
              percentile_cont(0.9) within group (order by extract(epoch from primer_toque_en - creado)) p90
         from i`, [negocioId, dias]);
    const porCanal = await q<{ canal: string; citas: number; interesados: number }>(
      `select canal, count(*) filter (where etapa in ('cita','asistio','vendido'))::int citas, count(*)::int interesados
         from interesado where tenant_id = $1 and creado >= now() - make_interval(days => $2)
        group by canal order by citas desc, interesados desc`, [negocioId, dias]);
    return {
      interesados: r!.interesados, contactados: r!.contactados, contestaron: r!.contestaron, conCita: r!.con_cita,
      perdidos: r!.perdidos, bajas: r!.bajas, porPersona: r!.por_persona,
      p50: r!.p50 === null ? null : Math.round(Number(r!.p50)), p90: r!.p90 === null ? null : Math.round(Number(r!.p90)), porCanal,
    };
  });
}
