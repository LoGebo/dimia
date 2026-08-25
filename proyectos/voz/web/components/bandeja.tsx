import Link from "next/link";
import { Insignia } from "@/components/ui/primitivos";
import { telefono as formatearTelefono } from "@/lib/formato";
import { NOMBRE_CANAL, type Conversacion } from "@/lib/tipos";

/**
 * Cuánto hace, en corto. En una bandeja lo que importa es "hace cuánto",
 * no la hora exacta: la fecha completa se lee dentro del hilo.
 */
export function hace(iso: string, ahora = Date.now()): string {
  const minutos = Math.round((ahora - new Date(iso).getTime()) / 60000);
  if (minutos < 1) return "ahora";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return `${dias} d`;
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export function nombreDe(c: Conversacion): string {
  const propio = c.contacto_nombre?.trim();
  if (propio) return propio;
  return c.contacto.startsWith("+") ? formatearTelefono(c.contacto) : c.contacto;
}

export function RenglonConversacion({
  conversacion: c,
  activa,
}: {
  conversacion: Conversacion;
  activa: boolean;
}) {
  const sinLeer = c.mensajes_sin_leer > 0;
  return (
    <Link
      href={`/bandeja/${c.id}`}
      aria-current={activa ? "page" : undefined}
      className={`block border-b border-linea px-4 py-3 transition hover:bg-panel-2 ${
        activa ? "bg-panel-2" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`truncate text-[13px] tracking-tight ${
            sinLeer ? "font-semibold text-tinta" : "font-medium text-tinta-2"
          }`}
        >
          {nombreDe(c)}
        </span>
        <span className="numeros shrink-0 text-[11px] text-tinta-3">
          {hace(c.ultimo_mensaje_en)}
        </span>
      </div>

      <p className="mt-1 truncate text-[12px] text-tinta-3">
        {c.ultimo_mensaje ?? "Sin mensajes todavía."}
      </p>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="etiqueta text-[10px]">{NOMBRE_CANAL[c.canal]}</span>
        {c.estado === "escalada" ? (
          <Insignia tono="alerta">Pidió una persona</Insignia>
        ) : null}
        {sinLeer ? <Insignia tono="acento">{c.mensajes_sin_leer} sin leer</Insignia> : null}
      </div>
    </Link>
  );
}
