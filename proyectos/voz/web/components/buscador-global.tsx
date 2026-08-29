"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAtajoPaleta, type GrupoComandos } from "@/components/kit";
import { PaletaPanel } from "@/components/kit/paleta-panel";

export type DestinoPaleta = { id: string; texto: string; detalle?: string; href: string; atajo?: string; claves?: string };

/**
 * El botón «Buscar ⌘K» del encabezado abre la paleta: pantallas del panel,
 * citas de hoy y la búsqueda libre de citas. «G» seguida de la letra de una
 * sección salta directo, como en la paleta.
 */
export function BuscadorGlobal({
  pantallas,
  citas = [],
  destinoBusqueda,
}: {
  pantallas: DestinoPaleta[];
  citas?: DestinoPaleta[];
  destinoBusqueda?: string;
}) {
  const router = useRouter();
  const paleta = useAtajoPaleta();
  const ultimaG = useRef(0);

  const saltos = useMemo(
    () =>
      Object.fromEntries(
        pantallas.filter((p) => p.atajo).map((p) => [p.atajo!.slice(-1).toLowerCase(), p.href]),
      ) as Record<string, string>,
    [pantallas],
  );

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const ahora = Date.now();
      if (k === "g") {
        ultimaG.current = ahora;
        return;
      }
      if (ahora - ultimaG.current < 700 && saltos[k]) {
        e.preventDefault();
        ultimaG.current = 0;
        router.push(saltos[k]!);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [saltos, router]);

  const grupos: GrupoComandos[] = useMemo(() => {
    const ir = {
      nombre: "Ir a",
      comandos: pantallas.map((p) => ({
        id: `ir-${p.id}`,
        texto: p.texto,
        detalle: p.detalle,
        atajo: p.atajo,
        claves: p.claves,
        onSelect: () => router.push(p.href),
      })),
    };
    const hoy = {
      nombre: "Citas de hoy",
      comandos: citas.map((c) => ({
        id: `cita-${c.id}`,
        texto: c.texto,
        detalle: c.detalle,
        claves: c.claves,
        onSelect: () => router.push(c.href),
      })),
    };
    const acciones = {
      nombre: "Panel",
      comandos: [
        {
          id: "tema",
          texto: "Cambiar entre claro y oscuro",
          claves: "tema modo noche",
          onSelect: () => {
            const siguiente = document.documentElement.dataset.tema === "oscuro" ? "claro" : "oscuro";
            document.documentElement.dataset.tema = siguiente;
            try {
              localStorage.setItem("tema", siguiente);
            } catch {}
          },
        },
      ],
    };
    return citas.length > 0 ? [ir, hoy, acciones] : [ir, acciones];
  }, [pantallas, citas, router]);

  return (
    <>
      <button
        type="button"
        onClick={paleta.abrir}
        aria-haspopup="dialog"
        aria-expanded={paleta.abierta}
        className="group flex h-8 items-center gap-2 border border-linea bg-panel-2 pr-2 pl-2.5 text-[13px] text-tinta-3 transition-colors duration-150 hover:border-linea-fuerte hover:bg-panel hover:text-tinta focus-visible:border-acento focus-visible:outline-none md:w-52"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3.5 w-3.5 flex-none" fill="none" stroke="currentColor" strokeWidth="1.4">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
        <span className="hidden flex-1 text-left md:inline">{destinoBusqueda ? "Buscar cita o ir a" : "Ir a una pantalla"}</span>
        <kbd className="hidden border border-linea bg-panel px-1 text-[10px] leading-4 text-tinta-3 transition-colors duration-150 group-hover:border-linea-fuerte md:inline">
          ⌘K
        </kbd>
      </button>
      <PaletaPanel
        abierta={paleta.abierta}
        cerrar={paleta.cerrar}
        grupos={grupos}
        alEscribir={
          destinoBusqueda
            ? (q) => ({
                nombre: "Buscar",
                comandos: [
                  {
                    id: "buscar-libre",
                    texto: `Buscar cita «${q}»`,
                    detalle: "por código, teléfono o nombre",
                    onSelect: () => router.push(`${destinoBusqueda}?q=${encodeURIComponent(q)}`),
                  },
                ],
              })
            : undefined
        }
      />
    </>
  );
}
