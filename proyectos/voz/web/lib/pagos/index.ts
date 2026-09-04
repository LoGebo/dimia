import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { clip } from "./clip";
import { mercadopago } from "./mercadopago";
import { stripe } from "./stripe";
import { PROVEEDORES, type Proveedor, type ProveedorPagos } from "./tipos";

export * from "./tipos";

const PASARELAS: Record<Proveedor, ProveedorPagos> = { mercadopago, clip, stripe };

export function pasarela(p: Proveedor): ProveedorPagos {
  return PASARELAS[p];
}

export function esProveedor(x: string): x is Proveedor {
  return (PROVEEDORES as string[]).includes(x);
}

/**
 * Token que ata la URL del webhook a un negocio concreto. Sin él, el `?t=` es
 * adivinable y cualquiera podría mandar avisos a nombre de otro negocio (Clip
 * no firma sus webhooks). Deriva del SESION_SECRETO del servidor, así que no
 * hay nada que guardar en la base y no se puede falsificar sin el secreto.
 */
function secretoWebhook(): string {
  const s = process.env.SESION_SECRETO;
  if (!s || s.length < 16) throw new Error("Falta SESION_SECRETO para firmar los webhooks de pago.");
  return s;
}

export function tokenWebhook(proveedor: Proveedor, tenantId: string): string {
  return createHmac("sha256", secretoWebhook()).update(`${proveedor}:${tenantId}`).digest("hex").slice(0, 32);
}

export function tokenWebhookValido(proveedor: Proveedor, tenantId: string, recibido: string | null): boolean {
  if (!recibido) return false;
  const esperado = Buffer.from(tokenWebhook(proveedor, tenantId));
  const dado = Buffer.from(recibido);
  return esperado.length === dado.length && timingSafeEqual(esperado, dado);
}

/** La URL pública a la que la pasarela manda sus avisos, atada al negocio con un token. */
export function urlWebhook(origen: string, proveedor: Proveedor, tenantId: string): string {
  return `${origen}/api/pagos/${proveedor}?t=${tenantId}&k=${tokenWebhook(proveedor, tenantId)}`;
}
