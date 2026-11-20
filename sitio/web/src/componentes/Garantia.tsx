"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GARANTIA } from "@/contenido/sitio";
import css from "./Garantia.module.css";

/* 0 cita existente · 1 entra la solicitud · 2 la base la rechaza · 3 se ofrece el siguiente espacio */
type Fase = 0 | 1 | 2 | 3;
const TIEMPOS = [900, 1400, 1500] as const;

/** La garantía como demostración: un horario ocupado no se puede volver a dar. */
export function Garantia() {
  const { colision } = GARANTIA;
  const [fase, setFase] = useState<Fase>(0);
  const raiz = useRef<HTMLDivElement>(null);
  const relojes = useRef<number[]>([]);

  const correr = useCallback(() => {
    relojes.current.forEach(clearTimeout);
    setFase(0);
    let espera = 0;
    relojes.current = TIEMPOS.map((t, i) => {
      espera += t;
      return window.setTimeout(() => setFase((i + 1) as Fase), espera);
    });
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFase(3);
      return;
    }
    const el = raiz.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        correr();
        io.disconnect();
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    const pendientes = relojes.current;
    return () => {
      io.disconnect();
      pendientes.forEach(clearTimeout);
    };
  }, [correr]);

  const renglones = [
    { visible: true, horario: colision.confirmada.horario, estado: colision.confirmada.estado, tono: "bueno" },
    {
      visible: fase >= 1,
      horario: colision.rechazada.horario,
      estado: fase >= 2 ? colision.rechazada.estado : "Revisando…",
      tono: fase >= 2 ? "critico" : "espera",
    },
    { visible: fase >= 3, horario: colision.ofrecida.horario, estado: colision.ofrecida.estado, tono: "acento" },
  ];

  return (
    <div ref={raiz} className={css.garantia}>
      <h3 className={css.titulo}>{GARANTIA.titular}</h3>
      <p className={css.cuerpo}>{GARANTIA.cuerpo}</p>

      <div className={css.consola}>
        <ol className={css.registro} aria-live="polite">
          {renglones.map((r, i) => (
            <li key={colision.registro[i]} className={css.renglon} data-visible={r.visible ? "1" : "0"}>
              <span className={css.rotulo}>{colision.registro[i]}</span>
              <span className={css.horario}>{r.horario}</span>
              <span className={css.estado} data-tono={r.tono}>
                <i aria-hidden="true" />
                {r.estado}
              </span>
            </li>
          ))}
        </ol>

        <div className={css.pie}>
          <button type="button" className={css.repetir} onClick={correr} disabled={fase > 0 && fase < 3}>
            {colision.repetir}
          </button>
        </div>
      </div>

    </div>
  );
}
