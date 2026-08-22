"use client";

import { useEffect, useState } from "react";

export function BotonTema() {
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");

  useEffect(() => {
    const actual = document.documentElement.dataset.tema;
    setTema(actual === "oscuro" ? "oscuro" : "claro");
  }, []);

  function alternar() {
    const siguiente = tema === "oscuro" ? "claro" : "oscuro";
    document.documentElement.dataset.tema = siguiente;
    localStorage.setItem("tema", siguiente);
    setTema(siguiente);
  }

  return (
    <button
      onClick={alternar}
      aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-linea text-tinta-3 transition hover:bg-panel-2 hover:text-tinta"
    >
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
        {tema === "oscuro" ? (
          <>
            <circle cx="8" cy="8" r="3" />
            <path d="M8 1v1.5M8 13.5V15M15 8h-1.5M2.5 8H1M12.9 3.1l-1 1M4.1 11.9l-1 1M12.9 12.9l-1-1M4.1 4.1l-1-1" />
          </>
        ) : (
          <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.8 5.8 0 1 0 7.1 7.1Z" />
        )}
      </svg>
    </button>
  );
}
