"use server";

import { revalidatePath } from "next/cache";
import { datos } from "@/lib/sesion";
import type { ConfigSeguimiento, PasoSeguimiento } from "@/lib/ventas";

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
        `insert into seguimiento_config (tenant_id, activo, nivel, dias, hora_inicio, hora_fin, objetivo, trato, preguntas, escalar, pasos, canales, actualizado)
         values ($1, $2, $3, $4, $5::time, $6::time, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, now())
         on conflict (tenant_id) do update set activo = excluded.activo, nivel = excluded.nivel, dias = excluded.dias, canales = excluded.canales,
           hora_inicio = excluded.hora_inicio, hora_fin = excluded.hora_fin, objetivo = excluded.objetivo, trato = excluded.trato,
           preguntas = excluded.preguntas, escalar = excluded.escalar, pasos = excluded.pasos, actualizado = now()`,
        [negocioId, c.activo, c.nivel, c.dias, c.hora_inicio, c.hora_fin, c.objetivo || "agendar", c.trato === "tu" ? "tu" : "usted",
         JSON.stringify(preguntas), JSON.stringify(escalar), pasos ? JSON.stringify(pasos) : null,
         JSON.stringify({ whatsapp: true, llamada: !!c.canales?.llamada, correo: false })],
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

/**
 * El dueño eligió una de las respuestas que le propuso el agente. Sale como mensaje del agente
 * (dentro de la ventana de 24 h) y la conversación vuelve al agente. «Le contesto yo» la toma.
 */
export async function elegirDecision(decisionId: string, letra: string): Promise<EstadoVentas> {
  try {
    return await datos(async (q, negocioId) => {
      const [d] = await q<{ interesado_id: string; opciones: { letra: string; mensaje: string }[]; conversacion_id: string | null; canal: string | null; contacto: string | null; ultimo: string | null }>(
        `select d.interesado_id, d.opciones, i.conversacion_id, c.canal::text canal, c.contacto,
                i.ultimo_mensaje_cliente_en ultimo
           from decision_dueno d join interesado i on i.id = d.interesado_id
           left join conversacion c on c.id = i.conversacion_id
          where d.id = $1 and d.tenant_id = $2 and d.elegida is null`, [decisionId, negocioId]);
      if (!d) return { error: "Esa decisión ya se tomó." };
      const opcion = d.opciones.find((o) => o.letra === letra);
      if (!opcion) return { error: "Opción no válida." };
      if (!opcion.mensaje) {
        await q("update decision_dueno set elegida = $2, resuelta_en = now() where id = $1", [decisionId, letra]);
        await q("update interesado set tomado_por_persona = true, actualizado = now() where id = $1", [d.interesado_id]);
        await q("select public.interesado_evento_registrar($1, 'tomado', null, '{}'::jsonb)", [d.interesado_id]);
        return { ok: "La conversación es suya. Contéstele desde Mensajes." };
      }
      if (!d.conversacion_id || !d.canal || !d.contacto) return { error: "No encuentro la conversación de esta persona." };
      if (!d.ultimo || Date.now() - +new Date(d.ultimo) > 23 * 3600 * 1000) {
        return { error: "Pasaron más de 24 h desde su último mensaje: WhatsApp ya no deja escribirle libre. Contéstele desde Mensajes." };
      }
      await q("update decision_dueno set elegida = $2, resuelta_en = now() where id = $1", [decisionId, letra]);
      await q(
        `insert into outbox (tenant_id, interesado_id, canal, destino, plantilla, payload)
         values ($1, $2, $3, $4, 'seguimiento', jsonb_build_object('mensaje', $5::text, 'interesado_id', $7::text, 'decision', $6::text))`,
        [negocioId, d.interesado_id, d.canal, d.contacto, opcion.mensaje, decisionId, d.interesado_id]);
      // Primero la etapa: así el trigger del mensaje ya programa el seguimiento normal.
      await q("update interesado set etapa = 'en_conversacion', actualizado = now() where id = $1", [d.interesado_id]);
      await q("update conversacion set estado = 'abierta' where id = $1", [d.conversacion_id]);
      await q("insert into mensaje (conversacion_id, tenant_id, autor, texto, herramienta) values ($1, $2, 'agente', $3, 'decision')",
        [d.conversacion_id, negocioId, opcion.mensaje]);
      await q("select public.interesado_evento_registrar($1, 'decision', $2, jsonb_build_object('letra', $3::text))", [d.interesado_id, d.canal, letra]);
      return { ok: "Enviado. El agente sigue con la conversación." };
    }).finally(() => revalidatePath("/ventas"));
  } catch {
    return { error: "No se pudo enviar. Intente de nuevo." };
  }
}

/** Empieza una prueba A/B: la mitad de los interesados recibe estos mensajes y la otra mitad los del nivel. */
export async function iniciarExperimento(mensajes: PasoSeguimiento[]): Promise<EstadoVentas> {
  const pasos = mensajes.filter((p) => p.mensaje.trim() && p.horas >= 1 && p.horas <= 23).slice(0, 4)
    .map((p) => ({ horas: Math.round(p.horas), mensaje: p.mensaje.trim().slice(0, 600) }));
  if (!pasos.length) return { error: "Escriba al menos un mensaje para la versión B." };
  try {
    await datos((q, negocioId) => q(
      "insert into experimento (tenant_id, nombre, variante_pasos) values ($1, $2, $3::jsonb)",
      [negocioId, `Prueba del ${new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" })}`, JSON.stringify(pasos)]));
  } catch {
    return { error: "Ya hay una prueba en curso." };
  }
  revalidatePath("/ventas/seguimiento");
  return { ok: "Prueba en marcha: la mitad de los interesados recibe la versión B." };
}

/** Termina la prueba. Con `adoptar`, la versión B queda como los mensajes del seguimiento. */
export async function terminarExperimento(id: string, adoptar: boolean): Promise<EstadoVentas> {
  try {
    await datos(async (q, negocioId) => {
      const [e] = await q<{ variante_pasos: PasoSeguimiento[] }>(
        "update experimento set estado = 'terminado', terminado = now() where id = $1 and tenant_id = $2 and estado = 'activo' returning variante_pasos",
        [id, negocioId]);
      if (e && adoptar) {
        await q("update seguimiento_config set nivel = 'propio', pasos = $2::jsonb, actualizado = now() where tenant_id = $1",
          [negocioId, JSON.stringify(e.variante_pasos)]);
      }
    });
  } catch {
    return { error: "No se pudo terminar la prueba." };
  }
  revalidatePath("/ventas/seguimiento");
  return { ok: adoptar ? "Listo: la versión B es ahora su seguimiento." : "Prueba terminada." };
}
