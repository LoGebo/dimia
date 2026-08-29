"use client";

import { useEffect, useRef, useState } from "react";

function reducido() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const suave = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Cifra que cuenta hasta su valor al montarse y, cuando el valor cambia,
 * cuenta desde el anterior. Los dígitos que cambian aparecen con un pop.
 */
export function CifraAnimada({
  valor,
  formato = (n) => Math.round(n).toLocaleString("es-MX"),
  duracion = 900,
  className = "",
}: {
  valor: number;
  formato?: (n: number) => string;
  duracion?: number;
  className?: string;
}) {
  const [mostrado, setMostrado] = useState(() => (reducido() ? valor : 0));
  const desde = useRef(reducido() ? valor : 0);
  const [contando, setContando] = useState(false);
  const [pop, setPop] = useState(0);

  useEffect(() => {
    if (reducido()) {
      desde.current = valor;
      setMostrado(valor);
      return;
    }
    const inicio = performance.now();
    const origen = desde.current;
    let marco = 0;
    setContando(true);
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      setMostrado(origen + (valor - origen) * suave(t));
      if (t < 1) marco = requestAnimationFrame(paso);
      else {
        setContando(false);
        setPop((p) => p + 1);
      }
    };
    marco = requestAnimationFrame(paso);
    desde.current = valor;
    return () => cancelAnimationFrame(marco);
  }, [valor, duracion]);

  const texto = formato(mostrado);

  return (
    <span className={`numeros inline-flex ${className}`} aria-label={formato(valor)}>
      {contando
        ? texto
        : Array.from(texto).map((ch, i) => (
            <span key={`${pop}-${i}`} className="kit-digito inline-block" style={{ animationDelay: `${i * 22}ms` }}>
              {ch === " " ? " " : ch}
            </span>
          ))}
    </span>
  );
}
