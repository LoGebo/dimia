"use client";

import { useEffect, useRef } from "react";
import css from "./ProgresoScroll.module.css";

/**
 * Barra de progreso de lectura: un filete de acento arriba que se llena a
 * medida que se hace scroll. Con movimiento reducido, se queda quieto.
 */
export function ProgresoScroll() {
  const relleno = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let raf = 0;
    const actualizar = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const p = max > 0 ? Math.min(Math.max(doc.scrollTop / max, 0), 1) : 0;
      if (relleno.current) relleno.current.style.transform = `scaleX(${p})`;
      raf = 0;
    };
    const alScroll = () => {
      if (!raf) raf = requestAnimationFrame(actualizar);
    };

    actualizar();
    window.addEventListener("scroll", alScroll, { passive: true });
    window.addEventListener("resize", alScroll);
    return () => {
      window.removeEventListener("scroll", alScroll);
      window.removeEventListener("resize", alScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className={css.barra} aria-hidden="true">
      <div ref={relleno} className={css.relleno} />
    </div>
  );
}
