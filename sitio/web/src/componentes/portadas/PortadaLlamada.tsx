"use client";

import { useEffect, useState } from "react";
import { CONVERSACIONES, FIRMA, HERO } from "@/contenido/sitio";
import ui from "../ui.module.css";
import css from "./PortadaLlamada.module.css";

const LLAMADA = CONVERSACIONES[0];
const PASO_MS = 1100;

/** Opción A: a la izquierda qué es; a la derecha, una llamada real contestándose. */
export function PortadaLlamada() {
  const total = LLAMADA.lineas.length + 1; // + la cita agendada
  const [visibles, setVisibles] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibles(total);
      return;
    }
    const reloj = window.setInterval(() => {
      setVisibles((v) => {
        if (v >= total) {
          window.clearInterval(reloj);
          return v;
        }
        return v + 1;
      });
    }, PASO_MS);
    return () => window.clearInterval(reloj);
  }, [total]);

  const r = LLAMADA.resultado;
  const terminada = visibles >= total;

  return (
    <section id="inicio" className={css.portada}>
      <div className={css.rejilla}>
        <div className={css.texto}>
          <p className={css.etiqueta}>Software de agentes de voz</p>
          <h1 className={css.titular}>{HERO.titular}</h1>
          <p className={css.entrada}>{HERO.entrada}</p>
          <div className={css.acciones}>
            <a href="#contacto" className={ui.botonPrimario}>
              {HERO.ctaPrimario}
            </a>
            <a href={FIRMA.telefonoHref} className={ui.botonSecundario}>
              {HERO.llamada}
            </a>
          </div>
          <ul className={css.datos}>
            {HERO.garantias.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>

        <div className={css.telefono} aria-label="Ejemplo de una llamada contestada por el agente">
          <div className={css.cabeza}>
            <span className={css.estado} data-terminada={terminada ? "1" : "0"}>
              <i aria-hidden="true" />
              {terminada ? "Llamada terminada" : "En llamada"}
            </span>
            <span className={css.hora}>21:04 · Restaurante</span>
          </div>
          <p className={css.aviso}>El restaurante ya cerró. Contesta el agente.</p>

          <ol className={css.lineas}>
            {LLAMADA.lineas.map((l, i) => (
              <li key={i} className={css.linea} data-quien={l.quien} data-visible={i < visibles ? "1" : "0"}>
                <span className={css.quien}>{l.quien === "agente" ? "Agente" : "Cliente"}</span>
                {l.texto}
              </li>
            ))}
          </ol>

          <div className={css.cita} data-visible={terminada ? "1" : "0"}>
            <span className={css.citaTitulo}>{r.tipo} agendada</span>
            <span className={css.citaDato}>
              {r.dia} · {r.hora} · {r.detalle}
            </span>
            <span className={css.citaNota}>Confirmación enviada por WhatsApp</span>
          </div>
        </div>
      </div>
    </section>
  );
}
