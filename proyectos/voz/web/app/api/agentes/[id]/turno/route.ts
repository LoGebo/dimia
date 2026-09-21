import { NextRequest } from "next/server";
import { orquestador } from "@/lib/agentes";

export const dynamic = "force-dynamic";

/** Reenvía el turno al orquestador y devuelve su stream tal cual (eventos SSE). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("id inválido", { status: 400 });
  const cuerpo = (await req.json().catch(() => null)) as { texto?: string; ruta?: string; adjuntos?: unknown[] } | null;
  const texto = cuerpo?.texto?.trim() ?? "";
  const adjuntos = Array.isArray(cuerpo?.adjuntos) ? cuerpo!.adjuntos.slice(0, 6) : undefined;
  if (!texto && !adjuntos?.length) return new Response("falta texto", { status: 400 });
  const ruta = cuerpo?.ruta === "rapido" || cuerpo?.ruta === "fuerte" ? cuerpo.ruta : undefined;
  const r = await orquestador(`/agentes/${id}/turno`, { method: "POST", body: JSON.stringify({ texto, ruta, adjuntos }), signal: req.signal });
  return new Response(r.body, { status: r.status, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
