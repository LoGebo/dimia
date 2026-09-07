"use client";

import { useEffect, useRef } from "react";
import css from "./FondoRejilla.module.css";

/**
 * Rejilla de cuadros tenue sobre la página: ambiente fijo muy sutil y, cerca del
 * cursor, los cuadros se encienden en azul. Solo el cuadrado como forma.
 * Con movimiento reducido no se monta.
 */
export function FondoRejilla() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const PASO = 46;
    const RADIO = 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let mx = -9999;
    let my = -9999;
    let raf = 0;
    let temporizador = 0;

    const redimensionar = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dibujar();
    };

    const dibujar = () => {
      ctx.clearRect(0, 0, w, h);
      for (let x = 0; x <= w; x += PASO) {
        for (let y = 0; y <= h; y += PASO) {
          const d = Math.hypot(x - mx, y - my);
          let alpha = 0.045;
          let s = 2;
          if (d < RADIO) {
            const t = 1 - d / RADIO;
            alpha += t * t * 0.55;
            s += t * 2.6;
          }
          ctx.fillStyle = `rgba(110,155,245,${alpha})`;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
      raf = 0;
    };

    const alMover = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      if (!raf) raf = requestAnimationFrame(dibujar);
      window.clearTimeout(temporizador);
      // Al detenerse, un último cuadro deja solo la rejilla ambiental.
      temporizador = window.setTimeout(() => {
        mx = -9999;
        my = -9999;
        dibujar();
      }, 160);
    };

    redimensionar();
    window.addEventListener("resize", redimensionar);
    window.addEventListener("mousemove", alMover, { passive: true });
    return () => {
      window.removeEventListener("resize", redimensionar);
      window.removeEventListener("mousemove", alMover);
      window.clearTimeout(temporizador);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <canvas ref={ref} className={css.lienzo} aria-hidden="true" />;
}
