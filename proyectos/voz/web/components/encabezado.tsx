import type { ReactNode } from "react";
import { Pestanas } from "@/components/pestanas";
import { contexto } from "@/lib/sesion";

/**
 * La cabecera de cada pantalla: título en Newsreader con remate cuadrado, una
 * línea de contexto, las acciones de la pantalla y las pestañas de su sección.
 */
export async function Encabezado({
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
  const { giro } = await contexto();

  return (
    <header className="border-b border-linea">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h1 className="titular flex items-baseline gap-1.5 text-[24px] text-tinta">
            {titulo}
            <i className="cuadrado" aria-hidden="true" />
          </h1>
          {descripcion ? <p className="mt-1.5 text-[12.5px] text-tinta-3">{descripcion}</p> : null}
        </div>
        {acciones || principal ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {acciones}
            {principal}
          </div>
        ) : null}
      </div>
      <Pestanas herramientas={giro.herramientas} />
    </header>
  );
}
