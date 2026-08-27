import Link from "next/link";
import type { ReactNode } from "react";
import { BotonMenu } from "@/components/armazon";
import { BuscadorGlobal } from "@/components/buscador-global";
import { ChipGiro } from "@/components/selector-negocio";
import { Pestanas } from "@/components/pestanas";
import { contadores } from "@/lib/consultas";
import { contexto } from "@/lib/sesion";

/**
 * La barra de cada pantalla: título a la izquierda; a la derecha las
 * herramientas de la pantalla y las globales (buscar, avisos, la cuenta).
 */
export async function Encabezado({
  titulo,
  descripcion,
  giro,
  acciones,
  principal,
  busqueda,
}: {
  titulo: string;
  descripcion?: string;
  giro?: string;
  acciones?: ReactNode;
  /** La acción grande de la pantalla, como «Nueva cita». */
  principal?: ReactNode;
  busqueda?: string;
}) {
  const [{ usuario, giro: giroActual }, avisos] = await Promise.all([contexto(), contadores()]);
  const pendientes = avisos.bandeja + avisos.recados;
  const conAgenda = giroActual.herramientas.includes("agendar");

  return (
    <header className="sticky top-0 z-20 border-b border-linea bg-paper/90 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <BotonMenu />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="flex items-baseline gap-1.5 font-display text-[24px] leading-none font-light tracking-[-0.012em] text-tinta">
                {titulo}
                <i className="cuadrado" aria-hidden="true" />
              </h1>
              {giro ? <ChipGiro nombre={giro} /> : null}
            </div>
            {descripcion ? <p className="mt-1 text-[12px] text-tinta-3">{descripcion}</p> : null}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {acciones}
          {acciones ? <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-linea md:block" /> : null}
          {conAgenda ? <BuscadorGlobal destino="/agenda" valor={busqueda} /> : null}
          <Link
            href={avisos.bandeja > 0 || avisos.recados === 0 ? "/bandeja" : "/recados"}
            aria-label={pendientes > 0 ? `${pendientes} pendientes` : "Sin pendientes"}
            title={`${avisos.bandeja} sin leer · ${avisos.recados} recados`}
            className="relative flex h-8 w-8 items-center justify-center border border-linea text-tinta-3 transition hover:bg-panel-2 hover:text-tinta"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11L4 11Z" />
              <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
            </svg>
            {pendientes > 0 ? (
              <span className="numeros absolute -top-1.5 -right-1.5 min-w-4 bg-acento px-1 text-center font-mono text-[10px] leading-4 text-acento-tinta">
                {pendientes}
              </span>
            ) : null}
          </Link>
          {principal}
          <span
            title={usuario.email}
            aria-label={usuario.email}
            className="flex h-8 w-8 items-center justify-center bg-tinta font-mono text-[11px] font-medium text-paper uppercase"
          >
            {usuario.email.slice(0, 2)}
          </span>
        </div>
      </div>
      <Pestanas herramientas={giroActual.herramientas} />
    </header>
  );
}
