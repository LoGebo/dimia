"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type TonoAviso = "neutro" | "bueno" | "alerta" | "critico";

export type Aviso = {
  id: string;
  titulo: string;
  detalle?: string;
  tono?: TonoAviso;
  /** Milisegundos antes de salir solo. 0 lo deja hasta que se cierre. */
  duracion?: number;
  accion?: { texto: string; onClick: () => void };
};

type Contexto = {
  avisar: (a: Omit<Aviso, "id"> & { id?: string }) => string;
  cerrar: (id: string) => void;
};

const Ctx = createContext<Contexto>({ avisar: () => "", cerrar: () => {} });

const CUADRO: Record<TonoAviso, string> = {
  neutro: "bg-tinta-3",
  bueno: "bg-bueno",
  alerta: "bg-alerta",
  critico: "bg-critico",
};

const BARRA: Record<TonoAviso, string> = {
  neutro: "bg-linea-fuerte",
  bueno: "bg-bueno",
  alerta: "bg-alerta",
  critico: "bg-critico",
};

export function useAvisos() {
  return useContext(Ctx);
}

/**
 * Los avisos se apilan abajo a la derecha, entran desde 12 px, salen solos
 * y se pausan mientras el puntero está encima. Máximo tres visibles.
 */
export function ProveedorAvisos({ children, maximo = 3 }: { children: ReactNode; maximo?: number }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [saliendo, setSaliendo] = useState<Set<string>>(new Set());
  const relojes = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; fin: number; resto: number }>());

  const quitar = useCallback((id: string) => {
    setSaliendo((s) => new Set(s).add(id));
    setTimeout(() => {
      setAvisos((v) => v.filter((a) => a.id !== id));
      setSaliendo((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }, 180);
  }, []);

  const programar = useCallback(
    (id: string, ms: number) => {
      if (ms <= 0) return;
      relojes.current.set(id, { t: setTimeout(() => quitar(id), ms), fin: Date.now() + ms, resto: ms });
    },
    [quitar],
  );

  const cerrar = useCallback(
    (id: string) => {
      const r = relojes.current.get(id);
      if (r) clearTimeout(r.t);
      relojes.current.delete(id);
      quitar(id);
    },
    [quitar],
  );

  const avisar = useCallback<Contexto["avisar"]>(
    (a) => {
      const id = a.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duracion = a.duracion ?? 4000;
      setAvisos((v) => [...v.filter((x) => x.id !== id), { ...a, id, duracion }]);
      programar(id, duracion);
      return id;
    },
    [programar],
  );

  useEffect(() => {
    if (avisos.length <= maximo) return;
    const sobra = avisos.slice(0, avisos.length - maximo);
    sobra.forEach((a) => cerrar(a.id));
  }, [avisos, maximo, cerrar]);

  function pausar(id: string) {
    const r = relojes.current.get(id);
    if (!r) return;
    clearTimeout(r.t);
    r.resto = Math.max(0, r.fin - Date.now());
  }

  function reanudar(id: string) {
    const r = relojes.current.get(id);
    if (!r) return;
    r.fin = Date.now() + r.resto;
    r.t = setTimeout(() => quitar(id), r.resto);
  }

  const valor = useMemo(() => ({ avisar, cerrar }), [avisar, cerrar]);

  return (
    <Ctx.Provider value={valor}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      >
        {avisos.map((a) => (
          <TarjetaAviso
            key={a.id}
            aviso={a}
            saliendo={saliendo.has(a.id)}
            cerrar={() => cerrar(a.id)}
            pausar={() => pausar(a.id)}
            reanudar={() => reanudar(a.id)}
          />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function TarjetaAviso({
  aviso,
  saliendo,
  cerrar,
  pausar,
  reanudar,
}: {
  aviso: Aviso;
  saliendo: boolean;
  cerrar: () => void;
  pausar: () => void;
  reanudar: () => void;
}) {
  const tono = aviso.tono ?? "neutro";
  const [corriendo, setCorriendo] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setCorriendo(true));
    return () => cancelAnimationFrame(t);
  }, []);

  return (
    <div
      role="status"
      onMouseEnter={pausar}
      onMouseLeave={reanudar}
      className={`pointer-events-auto relative overflow-hidden rounded-lg border border-linea bg-panel ${saliendo ? "kit-sale" : "aparece-derecha"}`}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <i aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 flex-none ${CUADRO[tono]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug font-medium text-tinta">{aviso.titulo}</p>
          {aviso.detalle ? <p className="mt-0.5 text-[12px] leading-snug text-tinta-2">{aviso.detalle}</p> : null}
        </div>
        {aviso.accion ? (
          <button
            type="button"
            onClick={() => {
              aviso.accion?.onClick();
              cerrar();
            }}
            className="flex-none text-[12px] font-semibold text-acento transition-colors duration-150 hover:text-tinta"
          >
            {aviso.accion.texto}
          </button>
        ) : null}
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar aviso"
          className="-mr-1 flex h-5 w-5 flex-none items-center justify-center text-tinta-3 transition-colors duration-150 hover:text-tinta"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.3">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>
      {aviso.duracion ? (
        <span
          aria-hidden="true"
          className={`kit-barra absolute bottom-0 left-0 h-0.5 ${BARRA[tono]}`}
          style={{ width: corriendo ? "0%" : "100%", transitionDuration: `${aviso.duracion}ms` }}
        />
      ) : null}
    </div>
  );
}
