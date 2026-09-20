import { NextRequest } from "next/server";
import { orquestador } from "@/lib/agentes";

export const dynamic = "force-dynamic";

/** Se engancha al turno que sigue corriendo en el servidor (el dueño se fue y volvió). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("id inválido", { status: 400 });
  const r = await orquestador(`/agentes/${id}/turno/seguir`, { signal: req.signal });
  if (r.status === 204) return new Response(null, { status: 204 });
  return new Response(r.body, { status: r.status, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
