import { fechaCorta, telefono as formatearTelefono } from "@/lib/formato";
import type { Conversacion } from "@/lib/tipos";

/**
 * Cuánto hace, en corto. En una bandeja lo que importa es "hace cuánto",
 * no la hora exacta: la fecha completa se lee dentro del hilo.
 */
export function hace(iso: string, zona: string, ahora = Date.now()): string {
  const minutos = Math.round((ahora - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return `${dias} d`;
  return fechaCorta(iso, zona);
}

export function nombreDe(c: Conversacion): string {
  const propio = c.contacto_nombre?.trim();
  if (propio) return propio;
  return c.contacto.startsWith("+") ? formatearTelefono(c.contacto) : c.contacto;
}
