"use client";

import { useEffect } from "react";

const PIEZAS = '[data-revela="titulo"], [data-revela="texto"], [data-revela="lista"] > *, [data-revela="logos"] > *';

/** Marca cada pieza cuando entra en pantalla; la animación vive en globals.css. */
export function Revelar() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (!e.isIntersecting) continue;
          e.target.setAttribute("data-visto", "entra");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    // Lo que ya está en pantalla (o arriba) se queda como está: sin parpadeo.
    document.querySelectorAll(PIEZAS).forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight) el.setAttribute("data-visto", "ya");
      else io.observe(el);
    });
    document.documentElement.classList.add("revela");
    return () => {
      io.disconnect();
      document.documentElement.classList.remove("revela");
    };
  }, []);
  return null;
}
