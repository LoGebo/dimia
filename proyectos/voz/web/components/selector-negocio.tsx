import { EstadoLinea, SoloAbierto, SoloPlegado } from "@/components/kit/lateral";
import type { Membresia } from "@/lib/tipos";

/**
 * El bloque del negocio en el armazón: nombre, giro, línea y estado.
 *
 * Antes era un selector para saltar entre negocios de la misma cuenta. Se quitó:
 * una cuenta atiende un negocio. El salto obligaba a que cada pantalla del panel
 * aguantara un cambio de giro a media navegación —de restaurante a clínica
 * cambian las secciones, las herramientas y el prompt— y ahí es donde tronaba.
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
        <div className="mx-3 mt-3 border border-linea bg-panel-2 px-3 pt-2.5 pb-2.5">
          <p className="truncate text-[13px] font-semibold tracking-tight text-tinta">{membresia.nombre}</p>
          <ChipGiro nombre={membresia.vertical_nombre} className="mt-1.5" />
          <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-linea pt-2.5">
            <div className="min-w-0">
              <p className="etiqueta">Línea</p>
              <p className="numeros mt-0.5 truncate font-mono text-[12px] text-tinta">{telefono ?? "sin asignar"}</p>
            </div>
            <EstadoLinea estado={estado} />
          </div>
        </div>
      </SoloAbierto>
      <SoloPlegado>
        <div
          title={`${membresia.nombre} · ${telefono ?? "sin línea"}`}
          className="mx-auto mt-3 flex h-9 w-9 flex-col items-center justify-center gap-1 border border-linea bg-panel-2"
        >
          <span className="numeros font-mono text-[11px] font-medium text-tinta uppercase">{membresia.nombre.slice(0, 2)}</span>
          <EstadoLinea estado={estado} compacto />
        </div>
      </SoloPlegado>
    </>
  );
}

export function ChipGiro({ nombre, className = "" }: { nombre: string; className?: string }) {
  return (
    <span
      title={nombre}
      className={`inline-flex max-w-full items-center gap-1.5 truncate border border-acento/30 bg-acento-suave px-1.5 py-0.5 text-[11px] font-medium text-acento ${className}`}
    >
      <i aria-hidden="true" className="h-1 w-1 flex-none bg-current" />
      {nombre}
    </span>
  );
}
