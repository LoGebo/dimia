"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

export type Comando = {
  id: string;
  texto: string;
  detalle?: string;
  /** Texto extra que también cuenta al buscar: código, teléfono. */
  claves?: string;
  atajo?: string;
  onSelect: () => void;
};

export type GrupoComandos = { nombre: string; comandos: Comando[] };

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Abre y cierra la paleta con ⌘K o Ctrl+K. */
export function useAtajoPaleta() {
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierta((v) => !v);
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  return { abierta, abrir: () => setAbierta(true), cerrar: () => setAbierta(false) };
}

/**
 * Paleta de comandos: filtra en vivo, agrupa, se recorre con ↑ ↓,
 * se ejecuta con Enter y se cierra con Escape.
 */
export function PaletaComandos({
  abierta,
  cerrar,
  grupos,
  marcador = "Buscar o ejecutar…",
}: {
  abierta: boolean;
  cerrar: () => void;
  grupos: GrupoComandos[];
  marcador?: string;
}) {
  const [q, setQ] = useState("");
  const [activo, setActivo] = useState(0);
  const campo = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const idLista = useId();

  const visibles = useMemo(() => {
    const n = normalizar(q.trim());
    if (!n) return grupos;
    return grupos
      .map((g) => ({
        ...g,
        comandos: g.comandos.filter((c) => normalizar(`${c.texto} ${c.detalle ?? ""} ${c.claves ?? ""}`).includes(n)),
      }))
      .filter((g) => g.comandos.length > 0);
  }, [grupos, q]);

  const planos = useMemo(() => visibles.flatMap((g) => g.comandos), [visibles]);

  useEffect(() => {
    if (abierta) {
      setQ("");
      setActivo(0);
      const t = setTimeout(() => campo.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [abierta]);

  useEffect(() => setActivo(0), [q]);

  useEffect(() => {
    const el = lista.current?.querySelector<HTMLElement>(`[data-indice="${activo}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activo]);

  const ejecutar = useCallback(
    (c: Comando) => {
      cerrar();
      c.onSelect();
    },
    [cerrar],
  );

  if (!abierta) return null;

  function tecla(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((a) => Math.min(planos.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = planos[activo];
      if (c) ejecutar(c);
    } else if (e.key === "Escape") {
      e.preventDefault();
      cerrar();
    }
  }

  let indice = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-tinta/40 px-4 pt-[14vh]"
      onMouseDown={cerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onMouseDown={(e) => e.stopPropagation()}
        className="kit-revela w-full max-w-[560px] border border-linea-fuerte bg-panel"
      >
        <div className="flex h-11 items-center gap-2.5 border-b border-linea px-3.5">
          <i aria-hidden="true" className="h-1.5 w-1.5 bg-acento" />
          <input
            ref={campo}
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-activedescendant={planos[activo] ? `${idLista}-${planos[activo].id}` : undefined}
            aria-autocomplete="list"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={tecla}
            placeholder={marcador}
            className="min-w-0 flex-1 bg-transparent text-[14px] text-tinta outline-none placeholder:text-tinta-3"
          />
          <kbd className="border border-linea px-1.5 font-mono text-[10px] leading-4 text-tinta-3">Esc</kbd>
        </div>

        <div ref={lista} id={idLista} role="listbox" className="max-h-[52vh] overflow-y-auto py-1">
          {planos.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-tinta-3">
              Sin resultados para <span className="text-tinta">«{q}»</span>.
            </p>
          ) : (
            visibles.map((g) => (
              <div key={g.nombre} role="group" aria-label={g.nombre}>
                <p className="etiqueta px-4 pt-2.5 pb-1">{g.nombre}</p>
                {g.comandos.map((c) => {
                  indice += 1;
                  const i = indice;
                  const es = i === activo;
                  return (
                    <div
                      key={c.id}
                      id={`${idLista}-${c.id}`}
                      role="option"
                      aria-selected={es}
                      data-indice={i}
                      onMouseEnter={() => setActivo(i)}
                      onClick={() => ejecutar(c)}
                      className={`mx-1 flex h-9 cursor-pointer items-center gap-3 px-3 text-[13px] transition-colors duration-100 ${
                        es ? "bg-panel-2 text-tinta" : "text-tinta-2"
                      }`}
                    >
                      <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${es ? "bg-acento" : "bg-linea-fuerte"}`} />
                      <span className="min-w-0 flex-1 truncate">
                        {c.texto}
                        {c.detalle ? <span className="ml-2 text-[12px] text-tinta-3">{c.detalle}</span> : null}
                      </span>
                      {c.atajo ? (
                        <kbd className="numeros font-mono text-[10.5px] text-tinta-3">{c.atajo}</kbd>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-linea px-4 py-2 font-mono text-[10.5px] text-tinta-3">
          <span>
            <kbd>↑↓</kbd> moverse
          </span>
          <span>
            <kbd>↵</kbd> abrir
          </span>
          <span className="numeros ml-auto">{planos.length} {planos.length === 1 ? "resultado" : "resultados"}</span>
        </div>
      </div>
    </div>
  );
}
