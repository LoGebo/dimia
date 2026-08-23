export type OutboxPlantilla = "confirmacion" | "cancelacion" | "recordatorio";
export type OutboxEstado = "pendiente" | "enviado" | "fallido";

export interface OutboxPayload {
  negocio: string;
  zona_horaria: string;
  cliente: string;
  servicio: string;
  recurso: string;
  personas: number;
  inicio: string;
  codigo: string;
  escalamiento: string | null;
}

export interface Outbox {
  id: string;
  tenant_id: string;
  booking_id: string | null;
  canal: string;
  destino: string;
  plantilla: OutboxPlantilla;
  payload: OutboxPayload;
  estado: OutboxEstado;
  intentos: number;
  max_intentos: number;
  disponible_en: string;
  ultimo_error: string | null;
  creado: string;
  enviado: string | null;
}

export interface EventoN8N {
  tipo: string;
  tenant_id: string;
  ocurrido: string;
  datos: Record<string, unknown>;
}

export interface ResultadoDrenado {
  reclamados: number;
  enviados: number;
  fallidos: number;
}
