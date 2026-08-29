import { createHmac, timingSafeEqual } from "node:crypto";
import { pedir, type Credenciales, type ProveedorPagos } from "./tipos";

const BASE = "https://api.stripe.com/v1";

function cab(c: Credenciales) {
  return { Authorization: `Bearer ${c.secret_key ?? ""}`, "Content-Type": "application/x-www-form-urlencoded" };
}

function forma(obj: Record<string, string | number>) {
  return new URLSearchParams(Object.entries(obj).map(([k, v]) => [k, String(v)])).toString();
}

type Sesion = { id: string; payment_status?: string; status?: string; metadata?: { pago_id?: string }; amount_total?: number };

/** Stripe: enlaces de pago; el webhook `checkout.session.completed` cierra el cobro. */
export const stripe: ProveedorPagos = {
  async crearEnlace(c, p) {
    const r = await pedir<{ id: string; url: string }>(
      `${BASE}/payment_links`,
      {
        method: "POST",
        headers: cab(c),
        body: forma({
          "line_items[0][price_data][currency]": p.moneda.toLowerCase(),
          "line_items[0][price_data][unit_amount]": Math.round(p.monto * 100),
          "line_items[0][price_data][product_data][name]": p.concepto.slice(0, 120),
          "line_items[0][quantity]": 1,
          "metadata[pago_id]": p.pagoId,
          "after_completion[type]": "redirect",
          "after_completion[redirect][url]": p.urlVolver,
        }),
      },
      "stripe",
    );
    return { url: r.url, referencia: r.id };
  },

  verificarWebhook(c, cuerpoCrudo, cabeceras) {
    const secreto = c.webhook_secret;
    if (!secreto) return true;
    const firma = cabeceras.get("stripe-signature") ?? "";
    const partes = Object.fromEntries(firma.split(",").map((s) => s.trim().split("=") as [string, string]));
    if (!partes.t || !partes.v1) return false;
    const esperado = createHmac("sha256", secreto).update(`${partes.t}.${cuerpoCrudo}`).digest("hex");
    const a = Buffer.from(esperado);
    const b = Buffer.from(partes.v1);
    return a.length === b.length && timingSafeEqual(a, b);
  },

  async interpretarWebhook(c, cuerpo) {
    const ev = (cuerpo ?? {}) as { type?: string; data?: { object?: Sesion } };
    const obj = ev.data?.object;
    if (!ev.type?.startsWith("checkout.session") || !obj?.id) return null;
    const sesion = await pedir<Sesion>(`${BASE}/checkout/sessions/${obj.id}`, { headers: cab(c) }, "stripe");
    return {
      pagoId: sesion.metadata?.pago_id ?? null,
      referencia: sesion.id,
      estado: sesion.payment_status === "paid" ? "pagado" : sesion.status === "expired" ? "cancelado" : "pendiente",
      monto: sesion.amount_total !== undefined ? sesion.amount_total / 100 : undefined,
    };
  },
};
