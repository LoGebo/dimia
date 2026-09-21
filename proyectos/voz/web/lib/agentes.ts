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
  return fetch(`${url}${ruta}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${secreto}`, "X-Negocio": negocioId, "Content-Type": "application/json" },
    cache: "no-store",
  });
}

export type EstadoCodex =
  | { estado: "conectado"; cuenta: string | null; expira: string; codex: boolean; claude: boolean; cerebro: "codex" | "claude" }
  | { estado: "pendiente"; codigo: string; url: string }
  | { estado: "sin_conectar" };
export type MensajeAgente = { id: number; de: "yo" | "agente" | "sistema"; texto: string; creado: string };
