import type { ReactNode } from "react";
import { HerramientasGlobales } from "@/components/herramientas-globales";
import { Pestanas } from "@/components/pestanas";
import { contexto } from "@/lib/sesion";

/**
 * La cabecera de cada pantalla: título en Newsreader con remate cuadrado, una
 * línea que dice para qué sirve, las acciones de la pantalla, buscar y avisos,
 * y las pestañas de la sección.
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
    <header className="sticky top-0 z-20 border-b border-linea bg-panel">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-5 pt-4 pb-3">
        <div className="min-w-0">
          <h1 className="titular flex items-baseline gap-1.5 text-[24px] text-tinta">
            {titulo}
            <i className="cuadrado" aria-hidden="true" />
          </h1>
          {descripcion ? <p className="mt-1.5 text-[12.5px] text-tinta-3">{descripcion}</p> : null}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {acciones}
          {principal}
          {acciones || principal ? <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-linea md:block" /> : null}
          <HerramientasGlobales />
        </div>
      </div>
      <Pestanas herramientas={giro.herramientas} />
    </header>
  );
}
