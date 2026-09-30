import "server-only";

import type { ConfigSeguimiento, ResultadosVentas } from "@/lib/ventas";

/** Un turno del chat con la agente de ventas, tal como lo guarda el navegador. */
export type TurnoVendedora = { rol: "usuario" | "asistente"; texto: string };

/** Lo que la agente propone cambiar de su configuración; se aplica solo si el dueño lo aprueba. */
export type Ajuste = { cambios: Partial<ConfigSeguimiento>; resumen: string };

export type RespuestaVendedora = { texto: string; ajuste?: Ajuste };

const MODELO = process.env.COPILOTO_MODELO ?? "gpt-4.1-mini";

const AJUSTAR = {
  type: "function",
  function: {
    name: "proponer_ajuste",
    description: "Propone cambiar tu forma de trabajar. Incluye solo los campos que cambian. El dueño lo aprueba con un botón.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        resumen: { type: "string", description: "El cambio en una frase, de usted, como lo leería el dueño." },
        objetivo: { type: "string", description: "Qué buscas lograr con cada interesado, en una frase. «agendar» es agendar una cita." },
        activo: { type: "boolean", description: "Si das seguimiento a quien deja de contestar." },
        nivel: { type: "string", enum: ["suave", "normal", "insistente"] },
        trato: { type: "string", enum: ["usted", "tu"] },
        dias: { type: "string", enum: ["lun-vie", "lun-sab", "todos"] },
        hora_inicio: { type: "string", description: "HH:MM" },
        hora_fin: { type: "string", description: "HH:MM" },
        preguntas: { type: "array", items: { type: "string" }, maxItems: 4, description: "La lista completa de preguntas antes de agendar." },
        escalar: { type: "array", items: { type: "string" }, maxItems: 8, description: "La lista completa de casos en que pasas la conversación a una persona." },
        llamada: { type: "boolean", description: "Llamar en el primer seguimiento." },
        mensajes: {
          type: "array", maxItems: 4,
          items: { type: "object", additionalProperties: false, properties: { horas: { type: "integer" }, mensaje: { type: "string" } }, required: ["horas", "mensaje"] },
          description: "Mensajes propios de seguimiento (horas desde su última respuesta, 1 a 23). Usa {nombre} para el nombre.",
        },
      },
      required: ["resumen"],
    },
  },
};

function sistema(negocio: string, c: ConfigSeguimiento, r: ResultadosVentas): string {
  return `Eres la agente de ventas de ${negocio} dentro del panel Dimia. Hablas con el dueño sobre tu propio trabajo: contestas a cada interesado por WhatsApp e Instagram y le das seguimiento hasta agendar.

Tu configuración actual:
- Objetivo: ${c.objetivo}
- Seguimiento: ${c.activo ? "encendido" : "apagado"}, nivel ${c.nivel}, trato de ${c.trato}, ${c.dias} de ${c.hora_inicio} a ${c.hora_fin}${c.canales?.llamada ? ", con llamada en el primer seguimiento" : ""}.
- Preguntas antes de agendar: ${c.preguntas.join(" | ") || "ninguna"}
- Pasas a una persona si: ${c.escalar.join(" | ") || "nunca"}
${c.nivel === "propio" && c.pasos ? `- Mensajes propios: ${c.pasos.map((p) => `a las ${p.horas} h «${p.mensaje}»`).join("; ")}` : ""}

Tus resultados de los últimos 30 días: ${r.interesados} interesados, ${r.contactados} contactados, ${r.contestaron} contestaron, ${r.conCita} con cita, ${r.perdidos} perdidos, ${r.bajas} pidieron baja, ${r.porPersona} esperan a una persona.${r.p50 !== null ? ` Contestas en ${Math.round(r.p50)} s (mediana).` : ""}

Cómo hablas:
- En primera persona, de usted, español de México, corto. Primero la respuesta, luego el porqué.
- Cuando el dueño pida cambiar cómo trabajas (objetivo, qué tanto insistes, horario, preguntas, cuándo pasarle a alguien, mensajes), usa proponer_ajuste con solo lo que cambia y dile en una frase qué propones. No digas que ya lo cambiaste: él lo aprueba.
- Si pide algo ambiguo, propón la versión más razonable en vez de preguntar.
- No inventes cifras: usa solo los resultados de arriba. Si no sabes algo, dilo.
- No puedes prometer precios, descuentos ni nada que el negocio no haya dicho.`;
}

export async function hablar(negocio: string, config: ConfigSeguimiento, resultados: ResultadosVentas, historial: TurnoVendedora[]): Promise<RespuestaVendedora> {
  const clave = process.env.OPENAI_API_KEY;
  if (!clave) return { texto: "No estoy configurada en este servidor (falta OPENAI_API_KEY)." };
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODELO, temperature: 0.3, max_tokens: 700, tools: [AJUSTAR], tool_choice: "auto",
      messages: [
        { role: "system", content: sistema(negocio, config, resultados) },
        ...historial.slice(-16).map((t) => ({ role: t.rol === "usuario" ? "user" : "assistant", content: t.texto })),
      ],
    }),
    cache: "no-store",
  });
  if (!r.ok) return { texto: `No pude contestar (${r.status}). Intente de nuevo.` };
  const data = (await r.json()) as { choices: { message: { content: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[] };
  const msg = data.choices[0]?.message;
  const llamada = msg?.tool_calls?.find((t) => t.function.name === "proponer_ajuste");
  if (!llamada) return { texto: (msg?.content ?? "").trim() || "No tengo nada que agregar." };
  let a: Record<string, unknown> = {};
  try {
    a = JSON.parse(llamada.function.arguments || "{}");
  } catch {}
  const ajuste = armarAjuste(a, config);
  if (!ajuste) return { texto: (msg?.content ?? "").trim() || "No entendí qué cambiar. ¿Me lo dice de otra forma?" };
  return { texto: (msg?.content ?? "").trim() || `Propongo: ${ajuste.resumen}`, ajuste };
}

/** Solo pasan campos conocidos con valores válidos; el servidor vuelve a validar al guardar. */
function armarAjuste(a: Record<string, unknown>, c: ConfigSeguimiento): Ajuste | null {
  const cambios: Partial<ConfigSeguimiento> = {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const lista = (v: unknown) => (Array.isArray(v) ? v.map(texto).filter(Boolean) : null);
  if (texto(a.objetivo)) cambios.objetivo = texto(a.objetivo).slice(0, 200);
  if (typeof a.activo === "boolean") cambios.activo = a.activo;
  if (["suave", "normal", "insistente"].includes(texto(a.nivel))) Object.assign(cambios, { nivel: texto(a.nivel), pasos: null });
  if (["usted", "tu"].includes(texto(a.trato))) cambios.trato = texto(a.trato) as "usted" | "tu";
  if (["lun-vie", "lun-sab", "todos"].includes(texto(a.dias))) cambios.dias = texto(a.dias) as ConfigSeguimiento["dias"];
  if (/^\d{2}:\d{2}$/.test(texto(a.hora_inicio))) cambios.hora_inicio = texto(a.hora_inicio);
  if (/^\d{2}:\d{2}$/.test(texto(a.hora_fin))) cambios.hora_fin = texto(a.hora_fin);
  const preguntas = lista(a.preguntas);
  if (preguntas) cambios.preguntas = preguntas.slice(0, 4);
  const escalar = lista(a.escalar);
  if (escalar) cambios.escalar = escalar.slice(0, 8);
  if (typeof a.llamada === "boolean") cambios.canales = { ...c.canales, llamada: a.llamada };
  if (Array.isArray(a.mensajes)) {
    const pasos = (a.mensajes as { horas?: unknown; mensaje?: unknown }[])
      .map((p) => ({ horas: Math.round(Number(p.horas)), mensaje: texto(p.mensaje) }))
      .filter((p) => p.mensaje && p.horas >= 1 && p.horas <= 23);
    if (pasos.length) Object.assign(cambios, { nivel: "propio", pasos });
  }
  if (!Object.keys(cambios).length) return null;
  return { cambios, resumen: texto(a.resumen).slice(0, 300) || "Ajustar mi configuración" };
}
