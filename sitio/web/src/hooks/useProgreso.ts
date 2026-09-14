"use client";

import { useEffect, useRef } from "react";

/**
 * Escribe `--p` (0 → 1) en el elemento según cuánto se ha recorrido al hacer scroll.
 * `inicio` y `fin` son fracciones de la pantalla: con 0.85 y 0.35, el avance empieza
 * cuando el borde superior entra al 85 % de la altura y termina cuando llega al 35 %
 * (medido sobre el alto del elemento). Con `alcance` 0 se mide solo el borde superior.
 *
 * Solo escucha el scroll mientras el elemento está en pantalla. Con movimiento
 * reducido deja `--p: 1` y no hace nada más: el contenido se lee completo.
 */
export function useProgreso<T extends HTMLElement>(inicio = 0.85, fin = 0.35, alcance = 1) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.setProperty("--p", "1");
      return;
    }

    let raf = 0;
    let escuchando = false;

    const medir = () => {
      raf = 0;
      const caja = el.getBoundingClientRect();
      const h = window.innerHeight;
      const desde = h * inicio;
      const hasta = h * fin - caja.height * alcance;
      const p = (desde - caja.top) / (desde - hasta);
      el.style.setProperty("--p", Math.min(Math.max(p, 0), 1).toFixed(4));
    };

    const alScroll = () => {
      if (!raf) raf = requestAnimationFrame(medir);
    };

    const escuchar = (si: boolean) => {
      if (si === escuchando) return;
      escuchando = si;
      if (si) {
        window.addEventListener("scroll", alScroll, { passive: true });
        window.addEventListener("resize", alScroll);
        alScroll();
      } else {
        window.removeEventListener("scroll", alScroll);
        window.removeEventListener("resize", alScroll);
        medir();
      }
    };

    const io = new IntersectionObserver(([e]) => escuchar(e.isIntersecting), {
      rootMargin: "20% 0px 20% 0px",
    });
    io.observe(el);
    medir();

    return () => {
      io.disconnect();
      escuchar(false);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [inicio, fin, alcance]);

  return ref;
}
