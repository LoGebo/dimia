import {
  autorizada,
  conReintento,
  entorno,
  json,
} from "../_shared/supabase.ts";
import type { EventoN8N } from "../_shared/tipos.ts";

const EVENTOS_VALIDOS = new Set([
  "reserva.creada",
  "reserva.cancelada",
  "llamada.terminada",
  "conversacion.escalada",
]);

async function firmar(cuerpo: string, secreto: string): Promise<string> {
  const llave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secreto),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const firma = await crypto.subtle.sign(
    "HMAC",
    llave,
    new TextEncoder().encode(cuerpo),
  );
  return [...new Uint8Array(firma)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (peticion: Request) => {
  if (!autorizada(peticion)) return json({ error: "no autorizada" }, 401);

  const destino = entorno("N8N_WEBHOOK");
  if (!destino) return json({ error: "N8N_WEBHOOK sin configurar" }, 503);

  const evento = (await peticion.json().catch(() => null)) as EventoN8N | null;
  if (!evento?.tipo || !evento?.tenant_id) {
    return json({ error: "evento invalido" }, 400);
  }
  if (!EVENTOS_VALIDOS.has(evento.tipo)) {
    return json({ error: `tipo desconocido: ${evento.tipo}` }, 400);
  }

  const cuerpo = JSON.stringify({
    ...evento,
    ocurrido: evento.ocurrido ?? new Date().toISOString(),
  });
  const secreto = entorno("N8N_SECRET");

  try {
    await conReintento(async () => {
      const respuesta = await fetch(destino, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(secreto
            ? { "x-signature-256": `sha256=${await firmar(cuerpo, secreto)}` }
            : {}),
        },
        body: cuerpo,
      });
      if (!respuesta.ok) {
        throw new Error(`n8n ${respuesta.status}: ${await respuesta.text()}`);
      }
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      502,
    );
  }

  return json({ reenviado: evento.tipo });
});
