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

/** La URL pública a la que la pasarela manda sus avisos, con el negocio en la ruta. */
export function urlWebhook(origen: string, proveedor: Proveedor, tenantId: string): string {
  return `${origen}/api/pagos/${proveedor}?t=${tenantId}`;
}
