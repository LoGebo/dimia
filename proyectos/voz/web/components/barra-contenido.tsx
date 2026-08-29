import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { HerramientasGlobales } from "@/components/herramientas-globales";
import { EstadoLinea } from "@/components/kit/lateral";
import { BotonTema } from "@/components/tema";
import type { Herramienta } from "@/lib/tipos";

/**
 * La barra de arriba del contenido: la acción principal del negocio, la línea
 * y su estado, buscar, ayuda, avisos y la cuenta.
 */
export function BarraContenido({
  email,
  telefono,
  estado,
  herramientas,
}: {
  email: string;
  telefono: string | null;
  estado: "activo" | "pausado" | "sin";
  herramientas: Herramienta[];
}) {
  const principal = herramientas.includes("agendar")
    ? { href: "/agenda?nueva=1", texto: "Nueva cita" }
    : herramientas.includes("pedido")
      ? { href: "/pedidos", texto: "Ver pedidos" }
      : { href: "/bandeja", texto: "Ver mensajes" };

  return (
    <div className="hidden h-[70px] min-w-0 items-center justify-end gap-2.5 overflow-hidden border-b border-linea bg-panel-2 px-6 lg:flex">
      <Link
        href={principal.href}
        className="inline-flex h-9 items-center rounded-lg bg-acento px-4 text-[15px] font-semibold text-acento-tinta transition-[filter] duration-100 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30"
      >
        {principal.texto}
      </Link>
      <div className="ml-1 hidden h-9 items-center gap-3 rounded-lg border border-linea bg-panel px-3 xl:flex">
        {telefono ? <span className="numeros text-[13px] font-semibold text-tinta">{telefono}</span> : null}
        <EstadoLinea estado={estado} />
      </div>
      <HerramientasGlobales />
      <Link
        href="/probar"
        aria-label="Ayuda: probar el agente"
        title="Probar el agente"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-linea bg-panel text-tinta-2 transition-colors duration-100 hover:bg-panel-2 hover:text-tinta focus-visible:border-acento focus-visible:outline-none"
      >
        <CircleHelp size={18} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <BotonTema />
      <span
        title={email}
        aria-label={email}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-linea text-[13px] font-bold text-tinta uppercase"
      >
        {email.slice(0, 1)}
      </span>
    </div>
  );
}
