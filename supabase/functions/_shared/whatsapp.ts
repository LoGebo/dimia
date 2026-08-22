import { entorno } from "./supabase.ts";
import type { OutboxPayload, OutboxPlantilla } from "./tipos.ts";

export function cuando(iso: string, zonaHoraria: string): string {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: zonaHoraria,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function redactar(
  plantilla: OutboxPlantilla,
  payload: OutboxPayload,
): string {
  const momento = cuando(payload.inicio, payload.zona_horaria);
  const nombre = payload.cliente.split(" ")[0];

  if (plantilla === "confirmacion") {
    return (
      `¡Listo, ${nombre}! Tu ${payload.servicio} en *${payload.negocio}* ` +
      `quedo para el ${momento}.\n\nTu codigo es *${payload.codigo}*. ` +
      `Si necesitas cambiarla, respondenos por aqui.`
    );
  }
  if (plantilla === "recordatorio") {
    return (
      `Hola ${nombre}, te recordamos tu ${payload.servicio} en ` +
      `*${payload.negocio}* mañana ${momento}.\n\n` +
      `Responde *confirmo* o *cancelo* y lo resolvemos por aqui.`
    );
  }
  return (
    `${nombre}, cancelamos tu ${payload.servicio} del ${momento} en ` +
    `*${payload.negocio}*. Cuando quieras agendar de nuevo, escribenos.`
  );
}

export async function enviarTexto(
  destino: string,
  texto: string,
): Promise<string> {
  const url = `${entorno("WHATSAPP_GRAPH_URL", "https://graph.facebook.com")}/` +
    `${entorno("WHATSAPP_API_VERSION", "v21.0")}/` +
    `${entorno("WHATSAPP_PHONE_NUMBER_ID")}/messages`;

  const respuesta = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${entorno("WHATSAPP_ACCESS_TOKEN")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: destino.replace(/\D/g, ""),
      type: "text",
      text: { preview_url: false, body: texto },
    }),
  });

  if (!respuesta.ok) {
    throw new Error(`whatsapp ${respuesta.status}: ${await respuesta.text()}`);
  }
  const cuerpo = await respuesta.json();
  return cuerpo?.messages?.[0]?.id ?? "";
}
