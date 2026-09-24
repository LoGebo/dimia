import "server-only";

import { contexto } from "@/lib/sesion";

/** El orquestador de agentes (proyectos/agentes): cerebros y máquina del negocio. */
function base(): { url: string; secreto: string } {
  const url = process.env.AGENTES_URL;
  const secreto = process.env.AGENTES_SECRETO_PANEL;
  if (!url || !secreto) throw new Error("Falta AGENTES_URL o AGENTES_SECRETO_PANEL");
  return { url: url.replace(/\/$/, ""), secreto };
}

export async function orquestador(ruta: string, init: RequestInit = {}): Promise<Response> {
  const { negocioId } = await contexto();
  const { url, secreto } = base();
  try {
    return await fetch(`${url}${ruta}`, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${secreto}`, "X-Negocio": negocioId, "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    // Orquestador caído o dormido: se responde como un 502 para que cada quien
    // caiga en su rama `!r.ok` en vez de reventar la página o la acción.
    // Si el que pidió ya se fue (abort), no hay a quién responderle.
    if (init.signal?.aborted) throw e;
    console.error("[agentes] el orquestador no respondió", ruta, e);
    // 502 y no 503: el orquestador ya usa 503 para «integración no disponible».
    return Response.json({ detail: "Los agentes no responden en este momento. Intente en unos minutos." }, { status: 502 });
  }
}

export type EstadoCodex =
  | { estado: "conectado"; cuenta: string | null; expira: string; codex: boolean; claude: boolean; cerebro: "codex" | "claude" }
  | { estado: "pendiente"; codigo: string; url: string }
  | { estado: "sin_conectar" };
export type MensajeAgente = { id: number; de: "yo" | "agente" | "sistema"; texto: string; creado: string; pasos?: { herramienta: string; detalle?: string; ms?: number; ok?: boolean }[] | null };
