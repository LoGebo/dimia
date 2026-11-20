"use client";

import { useEffect, useRef, useState } from "react";
import { CONVERSACIONES, HERO } from "@/contenido/sitio";
import css from "./Conversacion.module.css";

const PAUSA_LINEA = 1500;
const PAUSA_FINAL = 4200;

/**
 * La conversación como escenario: el visitante elige un giro y ve al agente atender
 * una llamada fuera de horario, línea por línea, hasta que la cita queda escrita.
 * Sin interacción, recorre los giros solo. Con movimiento reducido, se ve completa.
 */
export function Conversacion() {
  const [giro, setGiro] = useState(0);
  const [visibles, setVisibles] = useState(0);
  const [elegido, setElegido] = useState(false);
  const [quieto, setQuieto] = useState(false);
  const reloj = useRef<number | null>(null);

  const actual = CONVERSACIONES[giro];
  const total = actual.lineas.length;
  const terminada = visibles >= total;

  useEffect(() => {
    setQuieto(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (quieto) {
      setVisibles(total);
      return;
    }
    if (reloj.current) window.clearTimeout(reloj.current);
    if (visibles < total) {
      reloj.current = window.setTimeout(() => setVisibles((v) => v + 1), visibles === 0 ? 700 : PAUSA_LINEA);
    } else {
      reloj.current = window.setTimeout(() => {
        setVisibles(0);
        if (!elegido) setGiro((g) => (g + 1) % CONVERSACIONES.length);
      }, PAUSA_FINAL);
    }
    return () => {
      if (reloj.current) window.clearTimeout(reloj.current);
    };
  }, [visibles, total, elegido, quieto]);

  function elegir(i: number) {
    setElegido(true);
    setGiro(i);
    setVisibles(0);
  }

  return (
    <div className={css.escenario}>
      <div className={css.giros} role="tablist" aria-label="Elija su tipo de negocio">
        <p className={css.girosTitulo}>Vea cómo contesta en su giro</p>
        {CONVERSACIONES.map((c, i) => (
          <button
            key={c.giro}
            type="button"
            role="tab"
            aria-selected={i === giro}
            className={css.giro}
            data-activo={i === giro ? "1" : "0"}
            onClick={() => elegir(i)}
          >
            <i aria-hidden="true" />
            {c.giro}
          </button>
        ))}
      </div>

      <div className={css.llamada} role="tabpanel" aria-live="polite">
        <div className={css.barra}>
          <span className={css.hora}>{HERO.hora}</span>
          <span className={css.contexto}>{HERO.contexto}</span>
        </div>

        <ol className={css.lineas}>
          {actual.lineas.map((l, i) => (
            <li
              key={`${giro}-${i}`}
              className={css.linea}
              data-quien={l.quien}
              data-visible={i < visibles ? "1" : "0"}
            >
              <span className={css.quien}>{l.quien === "agente" ? "Agente" : "Cliente"}</span>
              <span className={css.texto}>{l.texto}</span>
            </li>
          ))}
          {!terminada && visibles > 0 && (
            <li className={css.escribiendo} aria-hidden="true">
              <i />
              <i />
              <i />
            </li>
          )}
        </ol>
      </div>

      <div className={css.resultado} data-listo={terminada ? "1" : "0"}>
        <p className={css.estado}>
          <i aria-hidden="true" />
          {terminada ? `${actual.resultado.tipo} confirmada` : "En llamada"}
        </p>
        <p className={css.dia}>{actual.resultado.dia}</p>
        <p className={css.horaCita}>{terminada ? actual.resultado.hora : "--:--"}</p>
        <p className={css.detalle}>{actual.resultado.detalle}</p>
        <p className={css.aviso}>{terminada ? "Confirmación enviada por WhatsApp" : "Consultando la agenda…"}</p>
      </div>
    </div>
  );
}
