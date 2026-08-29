import { EstadoLinea } from "@/components/kit/lateral";
import type { Membresia } from "@/lib/tipos";

/**
 * El bloque del negocio en el menú: nombre, giro, la línea y si está
 * contestando. Sin caja: texto sobre la misma superficie, separado por una regla.
 */
export function NombreNegocio({
  membresia,
  telefono,
  estado,
  fecha,
}: {
  membresia: Membresia | undefined;
  telefono: string | null;
  estado: "activo" | "pausado" | "sin";
  fecha?: string;
}) {
  if (!membresia) return null;
  return (
    <div className="border-b border-linea px-4 pt-3.5 pb-3.5">
      <p className="truncate text-[13.5px] font-semibold tracking-tight text-tinta">{membresia.nombre}</p>
      <p className="mt-0.5 truncate text-[12px] text-tinta-3">{membresia.vertical_nombre}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="numeros truncate text-[12px] text-tinta-2">{telefono ?? "Sin línea asignada"}</p>
        <EstadoLinea estado={estado} />
      </div>
      {fecha ? <p className="mt-2 text-[11.5px] text-tinta-3">{fecha}</p> : null}
    </div>
  );
}

/** El giro como texto discreto; solo se usa donde el giro cambia lo que ve el usuario. */
export function ChipGiro({ nombre, className = "" }: { nombre: string; className?: string }) {
  return (
    <span title={nombre} className={`inline-flex max-w-full items-center gap-1.5 truncate text-[12px] text-tinta-3 ${className}`}>
      <i aria-hidden="true" className="h-1 w-1 flex-none bg-laton" />
      {nombre}
    </span>
  );
}
