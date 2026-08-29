import type { ReactNode } from "react";

/**
 * La cabecera de cada pantalla: título de 24 px en negrita, una línea que
 * dice para qué sirve y, a la derecha, las acciones de la pantalla.
 */
export function Encabezado({
  titulo,
  descripcion,
  acciones,
  principal,
}: {
  titulo: string;
  descripcion?: string;
  giro?: string;
  acciones?: ReactNode;
  /** La acción grande de la pantalla, como «Nueva cita». */
  principal?: ReactNode;
  busqueda?: string;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="titular text-tinta">{titulo}</h1>
        {descripcion ? <p className="mt-1 text-[13px] text-tinta-3">{descripcion}</p> : null}
      </div>
      {acciones || principal ? <div className="ml-auto flex flex-wrap items-center gap-2">{acciones}{principal}</div> : null}
    </header>
  );
}
