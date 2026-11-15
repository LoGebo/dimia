"use client";

import { useEffect, useState } from "react";
import { PANEL_DEMO } from "@/contenido/sitio";
import { IconoDimia } from "./Iconos";
import css from "./PanelDemo.module.css";

/**
 * El panel del negocio como portada: la lista del día a la izquierda y, al elegir
 * una llamada, lo que se dijo y cómo terminó. Datos de ejemplo de un restaurante.
 */
export function PanelDemo() {
  const [elegida, setElegida] = useState(0);
  const [tocado, setTocado] = useState(false);
  const llamada = PANEL_DEMO.llamadas[elegida];

  // Sin interacción, recorre las llamadas para que se vea vivo.
  useEffect(() => {
    if (tocado || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const reloj = window.setInterval(() => {
      setElegida((i) => (i + 1) % PANEL_DEMO.llamadas.length);
    }, 5200);
    return () => window.clearInterval(reloj);
  }, [tocado]);

  return (
    <div className={css.ventana} aria-label="Demostración del panel de Dimia con datos de ejemplo">
      <div className={css.barra}>
        <span className={css.puntos} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={css.ruta}>Panel · {PANEL_DEMO.negocio}</span>
        <span className={css.vivo}>
          <i aria-hidden="true" />
          Agente contestando
        </span>
      </div>

      <div className={css.cuerpo}>
        <nav className={css.lateral} aria-hidden="true">
          <span className={css.negocio}>
            <IconoDimia tamano={20} />
            {PANEL_DEMO.negocio}
          </span>
          {PANEL_DEMO.menu.map((m, i) => (
            <span key={m} className={css.menu} data-activo={i === 0 ? "1" : "0"}>
              <i />
              {m}
            </span>
          ))}
        </nav>

        <div className={css.lista}>
          <p className={css.listaTitulo}>
            {PANEL_DEMO.dia}
            <span>{PANEL_DEMO.llamadas.length} llamadas</span>
          </p>
          <ul>
            {PANEL_DEMO.llamadas.map((l, i) => {
              const estado = PANEL_DEMO.estados[l.estado];
              return (
                <li key={l.hora}>
                  <button
                    type="button"
                    className={css.fila}
                    data-activa={i === elegida ? "1" : "0"}
                    onClick={() => {
                      setTocado(true);
                      setElegida(i);
                    }}
                  >
                    <span className={css.hora}>{l.hora}</span>
                    <span className={css.resumen}>{l.resumen}</span>
                    <span className={css.estado} style={{ color: estado.color }}>
                      <i style={{ background: estado.color }} />
                      <span>{estado.texto}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={css.detalle} aria-live="polite">
          <div className={css.detalleCabeza}>
            <p className={css.detalleTitulo}>{llamada.resumen}</p>
            <p className={css.detalleDato}>
              {llamada.hora} · duración {llamada.duracion}
            </p>
          </div>

          <ol key={elegida} className={css.lineas}>
            {llamada.lineas.map((linea, i) => (
              <li
                key={i}
                className={css.linea}
                data-quien={linea.quien}
                style={{ animationDelay: `${i * 260}ms` }}
              >
                <span className={css.quien}>{linea.quien === "agente" ? "Agente" : "Cliente"}</span>
                <span className={css.texto}>{linea.texto}</span>
              </li>
            ))}
          </ol>

          <p
            key={`c${elegida}`}
            className={css.cierre}
            style={{ animationDelay: `${llamada.lineas.length * 260}ms` }}
          >
            <i style={{ background: PANEL_DEMO.estados[llamada.estado].color }} aria-hidden="true" />
            {llamada.cierre}
          </p>
        </div>
      </div>
    </div>
  );
}
