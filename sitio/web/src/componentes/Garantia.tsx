"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GARANTIA } from "@/contenido/sitio";
import { Palabras } from "./Palabras";
import css from "./Garantia.module.css";

/* 0 agenda con la cita · 1 entra la solicitud · 2 la base la rechaza · 3 se ofrece el siguiente hueco */
type Fase = 0 | 1 | 2 | 3;
const TIEMPOS = [700, 1500, 1700] as const;

const aMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const tramo = (horario: string) => horario.split("–").map(aMinutos) as [number, number];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function Garantia() {
  const { colision } = GARANTIA;
  const [fase, setFase] = useState<Fase>(0);
  const raiz = useRef<HTMLDivElement>(null);
  const relojes = useRef<number[]>([]);

  /* La agenda se arma con los horarios del contenido, en renglones de 15 minutos. */
  const cita = tramo(colision.confirmada.horario);
  const solicitud = tramo(colision.rechazada.horario);
  const ofrecida = tramo(colision.ofrecida.horario);
  const base = cita[0] - 15;
  const renglones = Array.from({ length: (ofrecida[1] - base) / 15 }, (_, i) => base + i * 15);
  const filas = (t: [number, number]) => `${(t[0] - base) / 15 + 1} / ${(t[1] - base) / 15 + 1}`;

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
      { threshold: 0.45 },
    );
    io.observe(el);
    const pendientes = relojes.current;
    return () => {
      io.disconnect();
      pendientes.forEach(clearTimeout);
    };
  }, [correr]);

  const pasoEncendido = (i: number) => (i <= 1 ? fase >= 1 : fase >= i);

  return (
    <section id="garantia" className={css.seccion}>
      <div className={css.contenedor}>
        <div className={css.entrada}>
          <p className={css.rotulo}>{GARANTIA.rotulo}</p>
          <div className={css.texto}>
            <h2 className={css.titular}>
              <Palabras texto={GARANTIA.titular} />
            </h2>
            <p className={css.cuerpo}>{GARANTIA.cuerpo}</p>
          </div>
        </div>

        <div ref={raiz} className={css.demo} data-fase={fase}>
          <div className={css.columnaRuta}>
            <ol className={css.ruta}>
              {GARANTIA.ruta.map((paso, i) => (
                <li
                  key={paso}
                  className={css.paso}
                  data-encendido={pasoEncendido(i) ? "1" : "0"}
                  data-ultimo={i === GARANTIA.ruta.length - 1 ? "1" : "0"}
                  data-restriccion={i === 2 ? "1" : "0"}
                >
                  <i className={css.nodo} aria-hidden="true" />
                  <span className={css.pasoTexto}>{paso}</span>
                </li>
              ))}
            </ol>

            <figure className={css.libreta}>
              <picture>
                <source srcSet={`${GARANTIA.libreta.imagen}.avif`} type="image/avif" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${GARANTIA.libreta.imagen}.webp`}
                  alt={GARANTIA.libreta.alt}
                  width={960}
                  height={960}
                  loading="lazy"
                  decoding="async"
                  className={css.libretaFoto}
                />
              </picture>
              <figcaption className={css.libretaPie}>{GARANTIA.libreta.pie}</figcaption>
            </figure>
          </div>

          <div className={css.agendaMarco}>
            <div
              className={css.agenda}
              style={{ gridTemplateRows: `repeat(${renglones.length}, var(--renglon))` }}
              aria-label={`${colision.confirmada.horario} ${colision.confirmada.estado}. ${colision.rechazada.horario} ${colision.rechazada.estado}. ${colision.nota}`}
              role="img"
            >
              {renglones.map((min, i) => (
                <span key={min} className={css.hora} style={{ gridRow: i + 1 }}>
                  {min % 30 === 0 ? hhmm(min) : ""}
                </span>
              ))}

              <div className={css.bloqueCita} style={{ gridRow: filas(cita) }}>
                <span className={css.bloqueHora}>{colision.confirmada.horario}</span>
                <span className={css.bloqueEstado}>{colision.confirmada.estado}</span>
              </div>

              <div className={css.bloqueSolicitud} style={{ gridRow: filas(solicitud) }}>
                <span className={css.bloqueHora}>{colision.rechazada.horario}</span>
                <span className={css.bloqueEstado}>{fase >= 2 ? colision.rechazada.estado : " "}</span>
              </div>

              <div className={css.bloqueOfrecida} style={{ gridRow: filas(ofrecida) }}>
                <span className={css.bloqueHora}>{colision.ofrecida.horario}</span>
                <span className={css.bloqueEstado}>{colision.ofrecida.estado}</span>
              </div>
            </div>

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
