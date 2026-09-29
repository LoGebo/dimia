import { NextRequest } from "next/server";
import { orquestador } from "@/lib/agentes";

export const dynamic = "force-dynamic";

/**
 * Pase a la pantalla del agente. Es ruta y no acción de servidor: Next corre las acciones de una
 * página en fila, y despertar la computadora tarda ~40 s; como acción, el historial, el «sigue
 * trabajando» y hasta el envío del mensaje esperaban detrás y al recargar se veía el chat viejo.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: "id inválido" }, { status: 400 });
  const r = await orquestador(`/agentes/${id}/pantalla`, { method: "POST" });
  if (r.status === 409) return Response.json({ error: "Conecte su cuenta de ChatGPT para encender la computadora." });
  if (!r.ok) return Response.json({ error: "La computadora no respondió. Intente en un momento." });
  return Response.json(await r.json());
}
