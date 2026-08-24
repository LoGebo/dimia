"use client";

import { useEffect } from "react";
import { IconoDimia } from "@/components/marca";

/**
 * Algo reventó del lado del servidor. En vez de la pantalla cruda de Next,
 * se dice qué pasó y se ofrece una salida.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[panel]", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-[460px]">
        <IconoDimia tamano={26} />
        <h1 className="mt-6 font-display text-[30px] leading-tight font-light tracking-[-0.012em] text-tinta">
          Algo falló de este lado
          <i className="cuadrado ml-1.5 align-baseline" aria-hidden="true" />
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-tinta-2">
          No es tu culpa ni se perdió nada de lo que ya habías guardado. Vuelve a intentarlo; si
          sigue pasando, escríbenos y te decimos qué está pasando.
        </p>
        {error.digest ? (
          <p className="etiqueta mt-4">Referencia {error.digest}</p>
        ) : null}
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="min-h-[44px] bg-acento px-5 text-[14px] font-semibold text-acento-tinta transition hover:opacity-90"
          >
            Reintentar
          </button>
          <a href="/resumen" className="min-h-[44px] px-2 text-[14px] text-tinta-2 transition hover:text-tinta">
            Ir al resumen
          </a>
        </div>
      </div>
    </main>
  );
}
