import type { Membresia } from "@/lib/tipos";

/**
 * El nombre del negocio en el armazón.
 *
 * Antes era un selector para saltar entre negocios de la misma cuenta. Se quitó:
 * una cuenta atiende un negocio. El salto obligaba a que cada pantalla del panel
 * aguantara un cambio de giro a media navegación —de restaurante a clínica
 * cambian las secciones, las herramientas y el prompt— y ahí es donde tronaba.
 */
export function NombreNegocio({ membresia }: { membresia: Membresia | undefined }) {
  if (!membresia) return null;
  return (
    <div className="px-3 py-3">
      <p className="truncate text-[13px] font-semibold tracking-tight text-tinta">{membresia.nombre}</p>
      <ChipGiro nombre={membresia.vertical_nombre} className="mt-1.5" />
    </div>
  );
}

export function ChipGiro({ nombre, className = "" }: { nombre: string; className?: string }) {
  return (
    <span
      title={nombre}
      className={`inline-flex max-w-full items-center truncate rounded border border-acento/30 bg-acento-suave px-1.5 py-0.5 text-[11px] font-medium text-acento ${className}`}
    >
      {nombre}
    </span>
  );
}
