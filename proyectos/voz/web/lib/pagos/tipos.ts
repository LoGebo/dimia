export type Proveedor = "mercadopago" | "clip" | "stripe";

export const PROVEEDORES: Proveedor[] = ["mercadopago", "clip", "stripe"];

export const NOMBRE_PROVEEDOR: Record<Proveedor, string> = {
  mercadopago: "Mercado Pago",
  clip: "Clip",
  stripe: "Stripe",
};

/** Qué sabe hacer cada pasarela; lo que no sabe no se ofrece en el panel. */
export const CAPACIDADES: Record<Proveedor, { enlace: boolean; terminal: boolean }> = {
  mercadopago: { enlace: true, terminal: true },
  clip: { enlace: true, terminal: false },
  stripe: { enlace: true, terminal: false },
};

/** Los campos que el dueño pega en Ajustes → Pagos, por pasarela. */
export const CAMPOS_CREDENCIALES: Record<Proveedor, { clave: string; nombre: string; ayuda: string; secreto?: boolean }[]> = {
  mercadopago: [
    { clave: "access_token", nombre: "Access token", ayuda: "Tus integraciones → tu aplicación → Credenciales de producción.", secreto: true },
    { clave: "webhook_secret", nombre: "Clave secreta del webhook", ayuda: "Opcional. Webhooks → Configurar → clave secreta; con ella se verifica la firma.", secreto: true },
  ],
  clip: [
    { clave: "api_key", nombre: "API key", ayuda: "Panel de desarrolladores de Clip → Credenciales." },
    { clave: "secret_key", nombre: "Secret key", ayuda: "Se muestra una sola vez al crear la credencial.", secreto: true },
  ],
  stripe: [
    { clave: "secret_key", nombre: "Clave secreta (sk_…)", ayuda: "Developers → API keys.", secreto: true },
    { clave: "webhook_secret", nombre: "Secreto del webhook (whsec_…)", ayuda: "Developers → Webhooks → tu endpoint → Signing secret.", secreto: true },
  ],
};

export type Credenciales = Record<string, string>;

export type Terminal = { id: string; nombre: string; modo?: string };

export type ParamsEnlace = {
  pagoId: string;
  monto: number;
  moneda: string;
  concepto: string;
  urlWebhook: string;
  urlVolver: string;
};

export type ParamsTerminal = { terminalId: string; pagoId: string; monto: number; concepto: string };

export type EstadoCobro = "abierto" | "pagado" | "cancelado" | "error";

export type Interpretacion = {
  /** Id de nuestro `pago`, si el proveedor lo devolvió como referencia externa. */
  pagoId: string | null;
  referencia: string;
  estado: EstadoCobro | "pendiente";
  monto?: number;
} | null;

export interface ProveedorPagos {
  crearEnlace(c: Credenciales, p: ParamsEnlace): Promise<{ url: string; referencia: string }>;
  listarTerminales?(c: Credenciales): Promise<Terminal[]>;
  cobrarEnTerminal?(c: Credenciales, p: ParamsTerminal): Promise<{ referencia: string }>;
  estadoIntento?(c: Credenciales, referencia: string): Promise<{ estado: EstadoCobro; referenciaPago?: string }>;
  cancelarIntento?(c: Credenciales, terminalId: string, referencia: string): Promise<void>;
  /** Verdadero si la firma del aviso es válida o si el proveedor no firma. */
  verificarWebhook(c: Credenciales, cuerpoCrudo: string, cabeceras: Headers, url: URL): boolean;
  /** Lee el aviso y confirma con el proveedor antes de dar algo por pagado. */
  interpretarWebhook(c: Credenciales, cuerpo: unknown, cabeceras: Headers, url: URL): Promise<Interpretacion>;
}

export class ErrorPasarela extends Error {
  constructor(
    public proveedor: Proveedor,
    mensaje: string,
    public detalle?: unknown,
  ) {
    super(mensaje);
  }
}

export async function pedir<T>(url: string, init: RequestInit, proveedor: Proveedor): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  const texto = await r.text();
  let cuerpo: unknown = texto;
  try {
    cuerpo = texto ? JSON.parse(texto) : {};
  } catch {}
  if (!r.ok) {
    const detalle = cuerpo && typeof cuerpo === "object" && "message" in cuerpo ? String((cuerpo as { message: unknown }).message) : "";
    throw new ErrorPasarela(proveedor, detalle || `${r.status} ${r.statusText}`, cuerpo);
  }
  return cuerpo as T;
}
