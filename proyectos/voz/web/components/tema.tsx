"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Cambia entre claro y oscuro con un cruce de colores de 350 ms. */
export function BotonTema() {
  const [tema, setTema] = useState<"claro" | "oscuro">("claro");

  useEffect(() => {
    const actual = document.documentElement.dataset.tema;
    setTema(actual === "oscuro" ? "oscuro" : "claro");
  }, []);

  function alternar() {
    const siguiente = tema === "oscuro" ? "claro" : "oscuro";
    const raiz = document.documentElement;
    raiz.classList.add("cambia-tema");
    raiz.dataset.tema = siguiente;
    try {
      localStorage.setItem("tema", siguiente);
    } catch {}
    setTema(siguiente);
    setTimeout(() => raiz.classList.remove("cambia-tema"), 400);
  }

  return (
    <button
      onClick={alternar}
      aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={tema === "oscuro" ? "Modo claro" : "Modo oscuro"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-linea bg-panel text-tinta-2 transition-[background-color,color,transform] duration-150 hover:bg-panel-2 hover:text-tinta active:scale-95 focus-visible:border-acento focus-visible:outline-none"
    >
      <span key={tema} className="pop flex">
        {tema === "oscuro" ? <Sun size={18} strokeWidth={1.75} aria-hidden="true" /> : <Moon size={18} strokeWidth={1.75} aria-hidden="true" />}
      </span>
    </button>
  );
}
