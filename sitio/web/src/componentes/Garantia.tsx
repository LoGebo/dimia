"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GARANTIA } from "@/contenido/sitio";
import css from "./Garantia.module.css";

/* 0 cita existente · 1 entra la solicitud · 2 la base la rechaza · 3 se ofrece el siguiente hueco */
type Fase = 0 | 1 | 2 | 3;
const TIEMPOS = [900, 1400, 1500] as const;

const CLAVES = /(\b(?:alter|table|add|constraint|exclude|using|gist|with|where)\b)/g;

/** Resalta palabras clave de SQL sin librería: solo dos tonos. */
function resaltar(linea: string) {
  return linea.split(CLAVES).map((trozo, i) =>
    i % 2 === 1 ? (
      <span key={i} className={css.clave}>
        {trozo}
      </span>
    ) : (
      trozo
    ),
  );
}

export function Garantia() {
  const { colision, restriccion } = GARANTIA;
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
      { threshold: 0.4 },
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
      estado: fase >= 2 ? colision.rechazada.estado : "…",
      tono: fase >= 2 ? "critico" : "espera",
    },
    { visible: fase >= 3, horario: colision.ofrecida.horario, estado: colision.ofrecida.estado, tono: "acento" },
  ];

  return (
    <section id="garantia" className={css.seccion}>
      <div className={css.contenedor}>
        <h2 className={css.titular}>{GARANTIA.titular}</h2>

        <div ref={raiz} className={css.demo}>
          <p className={css.cuerpo}>{GARANTIA.cuerpo}</p>

          {/* La base en tinta: la restricción real y lo que responde a cada intento. */}
          <div className={css.consola}>
            <div className={css.consolaBarra}>
              <span className={css.consolaNombre}>{restriccion.nombre}</span>
              <span className={css.consolaPie}>{restriccion.pie}</span>
            </div>

            <pre className={css.codigo}>
              <code>
                {restriccion.codigo.split("\n").map((linea, i) => (
                  <span key={i} className={css.lineaCodigo}>
                    <span className={css.numeroLinea} aria-hidden="true">
                      {i + 1}
                    </span>
                    {resaltar(linea)}
                  </span>
                ))}
              </code>
            </pre>

            <ol className={css.registro} aria-live="polite">
              {renglones.map((r, i) => (
                <li key={colision.registro[i]} className={css.renglon} data-visible={r.visible ? "1" : "0"}>
                  <span className={css.renglonRotulo}>{colision.registro[i]}</span>
                  <span className={css.renglonHorario}>{r.horario}</span>
                  <span className={css.renglonEstado} data-tono={r.tono}>
                    <i aria-hidden="true" />
                    {r.estado}
                  </span>
                </li>
              ))}
            </ol>

            <div className={css.pieDemo}>
              <p className={css.nota} data-visible={fase >= 3 ? "1" : "0"}>
                {colision.nota}
              </p>
              <button type="button" className={css.repetir} onClick={correr} disabled={fase > 0 && fase < 3}>
                {colision.repetir}
              </button>
            </div>
          </div>
        </div>

        <p className={css.cita}>{GARANTIA.cita}</p>
      </div>
    </section>
  );
}
