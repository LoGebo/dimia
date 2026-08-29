import Link from "next/link";
import type { ReactNode } from "react";
import { BotonMenu } from "@/components/armazon";
import { BuscadorGlobal, type DestinoPaleta } from "@/components/buscador-global";
import { ChipGiro } from "@/components/selector-negocio";
import { Pestanas } from "@/components/pestanas";
import { contadores, negocio, reservasEntre } from "@/lib/consultas";
import { hora, isoDia, telefono } from "@/lib/formato";
import { secciones } from "@/lib/giro";
import { contexto } from "@/lib/sesion";

const ATAJO: Record<string, string> = { "/hoy": "G H", "/bandeja": "G M", "/clientes": "G C", "/agente": "G A" };

/**
 * La barra de cada pantalla: título a la izquierda; a la derecha las
 * herramientas de la pantalla y las globales (paleta ⌘K, avisos, la cuenta).
 */
export async function Encabezado({
  titulo,
  descripcion,
  giro,
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
  const [{ usuario, giro: giroActual }, avisos] = await Promise.all([contexto(), contadores()]);
  const pendientes = avisos.bandeja + avisos.recados;
  const conAgenda = giroActual.herramientas.includes("agendar");

  const pantallas: DestinoPaleta[] = secciones(giroActual.herramientas).flatMap((s) =>
    s.pestanas.map((p, i) => ({
      id: p.href,
      texto: p.nombre,
      detalle: s.nombre === p.nombre ? s.detalle : s.nombre,
      href: p.href,
      atajo: i === 0 ? (ATAJO[s.href] ?? (s.nombre === "Dinero" ? "G D" : undefined)) : undefined,
      claves: s.nombre,
    })),
  );

  let citas: DestinoPaleta[] = [];
  if (conAgenda) {
    const config = await negocio();
    const dia = isoDia(new Date(), config.zona_horaria);
    const lista = await reservasEntre(dia, dia);
    citas = lista
      .filter((r) => r.estado !== "cancelada")
      .map((r) => ({
        id: r.codigo,
        texto: r.cliente_nombre,
        detalle: `${r.codigo} · ${hora(r.inicio, config.zona_horaria)} · ${r.servicio}`,
        claves: `${r.telefono} ${telefono(r.telefono)}`,
        href: `/agenda?q=${encodeURIComponent(r.codigo)}`,
      }));
  }

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
          <BuscadorGlobal pantallas={pantallas} citas={citas} destinoBusqueda={conAgenda ? "/agenda" : undefined} />
          <Link
            href={avisos.bandeja > 0 || avisos.recados === 0 ? "/bandeja" : "/recados"}
            aria-label={pendientes > 0 ? `${pendientes} pendientes` : "Sin pendientes"}
            title={`${avisos.bandeja} sin leer · ${avisos.recados} recados`}
            className="relative flex h-8 w-8 items-center justify-center border border-linea text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta focus-visible:border-acento focus-visible:outline-none"
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
