"use client";

import { useEffect } from "react";

/**
 * Cada despliegue cambia los identificadores de las acciones de servidor: una pestaña abierta
 * desde antes manda identificadores que ya no existen y el panel se queda sin historial ni
 * «trabajando». Al detectarlo se recarga una sola vez (la guarda evita un ciclo).
 */
export function RecargaVersion() {
  useEffect(() => {
    function revisar(motivo: unknown) {
      const texto = motivo instanceof Error ? motivo.message : String(motivo ?? "");
      if (!/Server Action .*(not found|was not found)|Failed to find Server Action/i.test(texto)) return;
      try {
        if (sessionStorage.getItem("dimia-recargado") === "1") return;
        sessionStorage.setItem("dimia-recargado", "1");
      } catch {}
      window.location.reload();
    }
    const alRechazo = (e: PromiseRejectionEvent) => revisar(e.reason);
    const alError = (e: ErrorEvent) => revisar(e.error ?? e.message);
    window.addEventListener("unhandledrejection", alRechazo);
    window.addEventListener("error", alError);
    // La guarda se suelta hasta que la página nueva lleva un rato viva: si el error siguiera, no se cicla.
    const soltar = setTimeout(() => { try { sessionStorage.removeItem("dimia-recargado"); } catch {} }, 60_000);
    return () => { clearTimeout(soltar); window.removeEventListener("unhandledrejection", alRechazo); window.removeEventListener("error", alError); };
  }, []);
  return null;
}
