"use client";

import { useEffect, useRef, useState } from "react";
import css from "./Palabras.module.css";

/**
 * Revela un texto palabra por palabra al entrar en pantalla. Cada palabra sube
 * y aparece con un desfase corto. Sin JS o con movimiento reducido, el texto se
 * ve completo desde el inicio (mismo criterio que el sistema de revelado).
 */
export function Palabras({ texto, className }: { texto: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const palabras = texto.split(" ");

  return (
    <span ref={ref} className={className} data-vis={visible ? "1" : "0"}>
      {palabras.map((p, i) => (
        <span key={`${p}-${i}`} className={css.palabra} style={{ transitionDelay: `${i * 55}ms` }}>
          {p}
          {i < palabras.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
