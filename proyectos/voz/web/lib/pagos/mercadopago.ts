import { createHmac } from "node:crypto";
import { pedir, type Credenciales, type EstadoCobro, type ProveedorPagos } from "./tipos";

const BASE = "https://api.mercadopago.com";

function cab(c: Credenciales, extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${c.access_token ?? ""}`, "Content-Type": "application/json", ...extra };
}

const ESTADO_INTENTO: Record<string, EstadoCobro> = {
  OPEN: "abierto",
  ON_TERMINAL: "abierto",
  PROCESSING: "abierto",
  PROCESSED: "abierto",
  FINISHED: "pagado",
  CANCELED: "cancelado",
  ABANDONED: "cancelado",
  ERROR: "error",
};

type Dispositivo = { id: string; operating_mode?: string; pos_id?: number; store_id?: string };
type Intento = { id: string; state?: string; payment?: { id?: number | string; status?: string }; additional_info?: { external_reference?: string }; amount?: number };
type Pago = { id: number; status: string; external_reference?: string; transaction_amount?: number };

/**
 * Mercado Pago: enlaces con Checkout Pro y cobros en terminal Point por la
 * Integration API. La referencia externa siempre es el id de nuestro `pago`.
 */
export const mercadopago: ProveedorPagos = {
  async crearEnlace(c, p) {
    const r = await pedir<{ id: string; init_point: string }>(
      `${BASE}/checkout/preferences`,
      {
        method: "POST",
        headers: cab(c, { "X-Idempotency-Key": p.pagoId }),
        body: JSON.stringify({
          items: [{ title: p.concepto, quantity: 1, unit_price: p.monto, currency_id: p.moneda }],
          external_reference: p.pagoId,
          notification_url: p.urlWebhook,
          back_urls: { success: p.urlVolver, failure: p.urlVolver, pending: p.urlVolver },
          auto_return: "approved",
          metadata: { pago_id: p.pagoId },
        }),
      },
      "mercadopago",
    );
    return { url: r.init_point, referencia: r.id };
  },

  async listarTerminales(c) {
    const r = await pedir<{ devices?: Dispositivo[] }>(`${BASE}/point/integration-api/devices`, { headers: cab(c) }, "mercadopago");
    return (r.devices ?? []).map((d) => ({ id: d.id, nombre: d.id.replace(/__/g, " · "), modo: d.operating_mode }));
  },

  async cobrarEnTerminal(c, p) {
    await pedir(
      `${BASE}/point/integration-api/devices/${encodeURIComponent(p.terminalId)}`,
      { method: "PATCH", headers: cab(c), body: JSON.stringify({ operating_mode: "PDV" }) },
      "mercadopago",
    ).catch(() => undefined);
    const r = await pedir<Intento>(
      `${BASE}/point/integration-api/devices/${encodeURIComponent(p.terminalId)}/payment-intents`,
      {
        method: "POST",
        headers: cab(c, { "X-Idempotency-Key": p.pagoId }),
        body: JSON.stringify({
          amount: Math.round(p.monto * 100),
          description: p.concepto.slice(0, 60),
          additional_info: { external_reference: p.pagoId, print_on_terminal: true },
        }),
      },
      "mercadopago",
    );
    return { referencia: r.id };
  },

  async estadoIntento(c, referencia) {
    const r = await pedir<Intento>(`${BASE}/point/integration-api/payment-intents/${encodeURIComponent(referencia)}`, { headers: cab(c) }, "mercadopago");
    const estado = ESTADO_INTENTO[r.state ?? ""] ?? "abierto";
    if (estado === "pagado" && r.payment?.status && r.payment.status !== "approved") return { estado: "error" };
    return { estado, referenciaPago: r.payment?.id ? String(r.payment.id) : undefined };
  },

  async cancelarIntento(c, terminalId, referencia) {
    await pedir(
      `${BASE}/point/integration-api/devices/${encodeURIComponent(terminalId)}/payment-intents/${encodeURIComponent(referencia)}`,
      { method: "DELETE", headers: cab(c) },
      "mercadopago",
    );
  },

  verificarWebhook(c, _cuerpo, cabeceras, url) {
    const secreto = c.webhook_secret;
    if (!secreto) return true;
    const firma = cabeceras.get("x-signature") ?? "";
    const idRequest = cabeceras.get("x-request-id") ?? "";
    const partes = Object.fromEntries(firma.split(",").map((s) => s.trim().split("=") as [string, string]));
    const ts = partes.ts;
    const v1 = partes.v1;
    const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "";
    if (!ts || !v1) return false;
    const manifiesto = `id:${dataId.toLowerCase()};request-id:${idRequest};ts:${ts};`;
    const esperado = createHmac("sha256", secreto).update(manifiesto).digest("hex");
    return esperado === v1;
  },

  async interpretarWebhook(c, cuerpo, _cabeceras, url) {
    const b = (cuerpo ?? {}) as { type?: string; topic?: string; action?: string; data?: { id?: string | number }; id?: string; state?: string };
    const tipo = b.type ?? b.topic ?? url.searchParams.get("type") ?? url.searchParams.get("topic") ?? "";
    const id = String(b.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? "");

    if (tipo === "payment" && id) {
      const pago = await pedir<Pago>(`${BASE}/v1/payments/${id}`, { headers: cab(c) }, "mercadopago");
      return {
        pagoId: pago.external_reference ?? null,
        referencia: String(pago.id),
        estado: pago.status === "approved" ? "pagado" : pago.status === "cancelled" || pago.status === "rejected" ? "cancelado" : "pendiente",
        monto: pago.transaction_amount,
      };
    }

    if (tipo.startsWith("point_integration") || b.state) {
      const intento = await pedir<Intento>(`${BASE}/point/integration-api/payment-intents/${id || b.id}`, { headers: cab(c) }, "mercadopago");
      const estado = ESTADO_INTENTO[intento.state ?? ""] ?? "abierto";
      return {
        pagoId: intento.additional_info?.external_reference ?? null,
        referencia: String(intento.id),
        estado: estado === "abierto" ? "pendiente" : estado,
        monto: intento.amount !== undefined ? intento.amount / 100 : undefined,
      };
    }
    return null;
  },
};
