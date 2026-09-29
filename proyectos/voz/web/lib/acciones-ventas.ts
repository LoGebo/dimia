"use server";

import { revalidatePath } from "next/cache";
import { datos } from "@/lib/sesion";
import type { ConfigSeguimiento } from "@/lib/ventas";

export type EstadoVentas = { error?: string; ok?: string };

const NIVELES = new Set(["suave", "normal", "insistente", "propio"]);
const DIAS = new Set(["lun-vie", "lun-sab", "todos"]);
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Guarda cómo sigue el agente a los interesados. Valida en el servidor: el motor confía en esto. */
export async function guardarSeguimiento(c: ConfigSeguimiento): Promise<EstadoVentas> {
  if (!NIVELES.has(c.nivel) || !DIAS.has(c.dias) || !HORA.test(c.hora_inicio) || !HORA.test(c.hora_fin)) {
    return { error: "Revise el nivel, los días y el horario." };
  }
  if (c.hora_inicio >= c.hora_fin) return { error: "La hora de inicio debe ser antes de la de fin." };
  const preguntas = c.preguntas.map((p) => p.trim()).filter(Boolean).slice(0, 4);
  const escalar = c.escalar.map((p) => p.trim()).filter(Boolean).slice(0, 8);
  const pasos = c.nivel === "propio" && c.pasos
    ? c.pasos.filter((p) => p.mensaje.trim() && p.horas >= 1 && p.horas <= 23).slice(0, 4).map((p) => ({ horas: Math.round(p.horas), mensaje: p.mensaje.trim().slice(0, 600) }))
    : null;
  if (c.nivel === "propio" && !pasos?.length) return { error: "Con pasos propios hace falta al menos un mensaje." };
  try {
    await datos((q, negocioId) =>
      q(
        `insert into seguimiento_config (tenant_id, activo, nivel, dias, hora_inicio, hora_fin, objetivo, trato, preguntas, escalar, pasos, actualizado)
         values ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, now())
         on conflict (tenant_id) do update set activo = excluded.activo, nivel = excluded.nivel, dias = excluded.dias,
           hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, objetivo = excluded.objetivo, trato = excluded.trato,
           preguntas = excluded.preguntas, escalar = excluded.escalar, pasos = excluded.pasos, actualizado = now()`,
        [negocioId, c.activo, c.nivel, c.dias, c.hora_inicio, c.hora_fin, c.objetivo || "agendar", c.trato === "tu" ? "tu" : "usted",
         JSON.stringify(preguntas), JSON.stringify(escalar), pasos ? JSON.stringify(pasos) : null],
      ),
    );
  } catch {
    return { error: "No se pudo guardar. Intente de nuevo." };
  }
  revalidatePath("/ventas");
  return { ok: c.activo ? "Guardado. El agente ya da seguimiento con esta configuración." : "Guardado. El seguimiento está apagado." };
}

/** Tomar la conversación: el motor no le escribe mientras la lleva una persona. */
export async function tomarInteresado(id: string, tomar: boolean): Promise<EstadoVentas> {
  try {
    await datos(async (q, negocioId) => {
      await q("update interesado set tomado_por_persona = $3, actualizado = now() where id = $1 and tenant_id = $2", [id, negocioId, tomar]);
      await q("select public.interesado_evento_registrar($1, $2, null, '{}'::jsonb)", [id, tomar ? "tomado" : "devuelto"]);
    });
  } catch {
    return { error: "No se pudo cambiar." };
  }
  revalidatePath("/ventas");
  return {};
}

const RESULTADOS: Record<string, string> = { vendido: "vendido", no_interesa: "perdido", no_ideal: "perdido" };

export async function marcarResultado(id: string, resultado: string): Promise<EstadoVentas> {
  const etapa = RESULTADOS[resultado];
  if (!etapa) return { error: "Resultado no válido." };
  try {
    await datos(async (q, negocioId) => {
      await q(
        `update interesado set etapa = $3::interesado_etapa, resultado = $4, proxima_accion_en = null, actualizado = now()
          where id = $1 and tenant_id = $2`, [id, negocioId, etapa, resultado]);
      await q("select public.interesado_evento_registrar($1, 'resultado', null, jsonb_build_object('resultado', $2::text))", [id, resultado]);
    });
  } catch {
    return { error: "No se pudo guardar el resultado." };
  }
  revalidatePath("/ventas");
  return {};
}
