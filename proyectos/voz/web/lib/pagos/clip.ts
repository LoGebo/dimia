import { pedir, type Credenciales, type ProveedorPagos } from "./tipos";

const BASE = "https://api.payclip.com";

function cab(c: Credenciales) {
  const token = Buffer.from(`${c.api_key ?? ""}:${c.secret_key ?? ""}`).toString("base64");
  return { Authorization: `Basic ${token}`, "x-api-key": `Basic ${token}`, "Content-Type": "application/json" };
}

type Checkout = { payment_request_id: string; payment_request_url: string; status?: string };
type Detalle = { payment_request_id?: string; status?: string; amount?: number; metadata?: { external_reference?: string } };

const PAGADO = new Set(["CHECKOUT_COMPLETED", "PAID", "APPROVED", "COMPLETED"]);
const CANCELADO = new Set(["CHECKOUT_CANCELLED", "CANCELLED", "CANCELED", "EXPIRED", "REJECTED", "DECLINED"]);

/**
 * Clip: enlaces de pago con Checkout. La terminal física no expone API abierta
 * (su SDK es para apps Android), así que aquí solo van enlaces; los cobros en
 * la terminal se concilian aparte.
 */
export const clip: ProveedorPagos = {
  async crearEnlace(c, p) {
    const r = await pedir<Checkout>(
      `${BASE}/v2/checkout`,
      {
        method: "POST",
        headers: cab(c),
        body: JSON.stringify({
          amount: Number(p.monto.toFixed(2)),
          currency: p.moneda,
          purchase_description: p.concepto.slice(0, 250),
          metadata: { external_reference: p.pagoId },
          webhook_url: p.urlWebhook,
          redirection_url: { success: p.urlVolver, error: p.urlVolver, default: p.urlVolver },
        }),
      },
      "clip",
    );
    return { url: r.payment_request_url, referencia: r.payment_request_id };
  },

  verificarWebhook() {
    // Clip no firma sus webhooks. La URL lleva un token por negocio
    // (tokenWebhook) que la ruta valida antes de llegar aquí, y el estado se
    // reconfirma contra la API de Clip antes de marcar el pago: esas dos capas
    // son la frontera, no el cuerpo del aviso.
    return true;
  },

  async interpretarWebhook(c, cuerpo) {
    const b = (cuerpo ?? {}) as { payment_request_id?: string; id?: string; status?: string; metadata?: { external_reference?: string }; amount?: number };
    const referencia = b.payment_request_id ?? b.id;
    if (!referencia) return null;
    let detalle: Detalle = b;
    try {
      detalle = await pedir<Detalle>(`${BASE}/v2/checkout/${encodeURIComponent(referencia)}`, { headers: cab(c) }, "clip");
    } catch {}
    const estado = String(detalle.status ?? b.status ?? "").toUpperCase();
    return {
      pagoId: detalle.metadata?.external_reference ?? b.metadata?.external_reference ?? null,
      referencia,
      estado: PAGADO.has(estado) ? "pagado" : CANCELADO.has(estado) ? "cancelado" : "pendiente",
      monto: detalle.amount ?? b.amount,
    };
  },
};
