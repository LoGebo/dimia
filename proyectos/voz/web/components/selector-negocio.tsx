import { EstadoLinea, SoloAbierto, SoloPlegado } from "@/components/kit/lateral";
import type { Membresia } from "@/lib/tipos";

/**
 * El bloque del negocio en el armazón: nombre, giro, línea y estado. Sin caja:
 * es texto sobre la misma superficie, separado del menú por una regla.
 *
 * Antes era un selector para saltar entre negocios de la misma cuenta. Se quitó:
 * una cuenta atiende un negocio.
 */
export function NombreNegocio({
  membresia,
  telefono,
  estado,
}: {
  membresia: Membresia | undefined;
  telefono: string | null;
  estado: "activo" | "pausado" | "sin";
}) {
  if (!membresia) return null;
  return (
    <>
      <SoloAbierto>
        <div className="border-b border-linea px-4 pt-3.5 pb-3.5">
          <p className="truncate text-[13.5px] font-semibold tracking-tight text-tinta">{membresia.nombre}</p>
          <p className="mt-0.5 truncate text-[12px] text-tinta-3">{membresia.vertical_nombre}</p>
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <p className="numeros truncate font-mono text-[12px] text-tinta-2">{telefono ?? "Sin línea asignada"}</p>
            <EstadoLinea estado={estado} />
          </div>
        </div>
      </SoloAbierto>
      <SoloPlegado>
        <div
          title={`${membresia.nombre} · ${telefono ?? "sin línea"}`}
          className="mx-auto mt-3 flex h-9 w-9 flex-col items-center justify-center gap-1 border-b border-linea"
        >
          <span className="numeros font-mono text-[11px] font-medium text-tinta uppercase">{membresia.nombre.slice(0, 2)}</span>
          <EstadoLinea estado={estado} compacto />
        </div>
      </SoloPlegado>
    </>
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
