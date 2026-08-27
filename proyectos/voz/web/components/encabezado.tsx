import Link from "next/link";
import type { ReactNode } from "react";
import { BotonMenu } from "@/components/armazon";
import { BuscadorGlobal } from "@/components/buscador-global";
import { ChipGiro } from "@/components/selector-negocio";
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
  compacto: _compacto = false,
}: {
  titulo: string;
  descripcion?: string;
  giro?: string;
  acciones?: ReactNode;
  /** La acción grande de la pantalla, como «Nueva cita». */
  principal?: ReactNode;
  busqueda?: string;
  /** Todo en la barra, sin bloque de título. Para pantallas de lista y detalle. */
  compacto?: boolean;
}) {
  const [{ usuario, giro: giroActual }, avisos] = await Promise.all([contexto(), contadores()]);
  const pendientes = avisos.bandeja + avisos.recados;
  const conAgenda = giroActual.herramientas.includes("agendar");

  return (
    <header className="sticky top-0 z-20 bg-marco/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 pt-5 pb-4 max-md:px-3">
        <div className="flex min-w-0 items-center gap-3">
          <BotonMenu />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="flex items-baseline gap-1.5 text-[22px] leading-none font-semibold tracking-[-0.015em] text-tinta">
                {titulo}
                <i className="cuadrado" aria-hidden="true" />
              </h1>
              {giro ? <ChipGiro nombre={giro} /> : null}
            </div>
            {descripcion ? <p className="mt-1 truncate text-[12.5px] text-tinta-3">{descripcion}</p> : null}
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
            className="relative flex h-9 w-9 items-center justify-center bg-pozo text-tinta-2 transition hover:text-tinta"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11L4 11Z" />
              <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
            </svg>
            {pendientes > 0 ? (
              <span className="numeros absolute -top-1 -right-1 min-w-4 bg-acento px-1 text-center font-mono text-[10px] leading-4 text-acento-tinta">
                {pendientes}
              </span>
            ) : null}
          </Link>
          {principal}
          <span
            title={usuario.email}
            aria-label={usuario.email}
            className="flex h-9 w-9 items-center justify-center bg-tinta font-mono text-[11px] font-medium text-paper uppercase"
          >
            {usuario.email.slice(0, 2)}
          </span>
        </div>
      </div>
    </header>
  );
}

export function Indicador({
  etiqueta,
  valor,
  detalle,
  tono,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
  tono?: "bueno" | "alerta" | "critico";
}) {
  const color = tono ? { bueno: "text-bueno", alerta: "text-alerta", critico: "text-critico" }[tono] : "text-tinta";
  return (
    <div className="bg-panel px-4 py-3.5">
      <p className="etiqueta">{etiqueta}</p>
      <p className={`numeros mt-1.5 text-[26px] leading-none font-semibold tracking-tight ${color}`}>{valor}</p>
      {detalle ? <p className="mt-1.5 text-[11px] text-tinta-3">{detalle}</p> : null}
    </div>
  );
}
