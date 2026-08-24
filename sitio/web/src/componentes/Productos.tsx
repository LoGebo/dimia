"use client";

import { PRODUCTO, PROXIMOS } from "@/contenido/sitio";
import { usePanelLlamada } from "@/hooks/usePanelLlamada";
import { Flecha } from "./Iconos";
import ui from "./ui.module.css";
import css from "./Productos.module.css";

const ESTADOS = {
  espera: { texto: "En espera", color: "var(--acero-2)", tinta: "var(--acero)", late: false },
  llamada: { texto: "En llamada", color: "var(--acento)", tinta: "var(--acento)", late: true },
  confirmada: { texto: "Confirmada", color: "var(--bueno)", tinta: "var(--bueno)", late: false },
} as const;

export function Productos() {
  const { fase, reloj, folio, bitacora } = usePanelLlamada();
  const estado = ESTADOS[fase];

  return (
    <section id="productos" className={ui.seccion}>
      <div className={ui.contenedor}>
        <div className={ui.encabezado}>
          <p data-revelar className={ui.rotulo}>Productos</p>
          <h2 data-revelar className={ui.titulo}>
            Lo que ya opera con clientes, empaquetado
            <i className={ui.cuadrado} />
          </h2>
        </div>

        <div className={css.columnas}>
          <div className={css.ficha}>
            <div className={ui.estado} style={{ color: "var(--bueno)", marginBottom: 22 }}>
              <i className={ui.punto} style={{ background: "var(--bueno)" }} />
              {PRODUCTO.estado}
            </div>
            <h3 className={css.nombre}>{PRODUCTO.nombre}</h3>
            <p className={css.resumen}>{PRODUCTO.resumen}</p>

            <div className={ui.fichas}>
              {PRODUCTO.fichas.map((f, i) => (
                <div
                  key={f.rotulo}
                  className={ui.ficha}
                  style={i === PRODUCTO.fichas.length - 1 ? { borderBottom: "1px solid var(--linea)" } : undefined}
                >
                  <span className={ui.fichaRotulo} style={{ flexBasis: 150 }}>
                    {f.rotulo}
                  </span>
                  <span className={f.mono ? css.valorMono : css.valor}>{f.valor}</span>
                </div>
              ))}
            </div>

            <a href="#contacto" className={css.cta}>
              {PRODUCTO.cta}
              <Flecha />
            </a>
          </div>

          {/* Panel de la línea principal: la secuencia real de una llamada */}
          <div data-revelar className={css.panel}>
            <div className={css.panelBarra}>
              <span className={css.panelRotulo}>Línea principal</span>
              <span className={ui.estado} style={{ color: estado.tinta }}>
                <i
                  className={ui.punto}
                  data-anima={estado.late ? "1" : undefined}
                  style={{
                    background: estado.color,
                    animation: estado.late ? "latido 1.9s ease-in-out infinite" : undefined,
                  }}
                />
                {estado.texto}
              </span>
            </div>

            <div className={css.panelReloj}>
              <span className={css.reloj}>{reloj}</span>
              <span className={css.folio}>{folio}</span>
            </div>

            <div className={css.bitacora}>
              {bitacora.map((evento, i) => (
                <div key={`${evento.t}-${i}`} className={css.evento}>
                  <span className={css.eventoHora}>{evento.t}</span>
                  <i className={css.eventoPunto} />
                  <span className={css.eventoTexto}>{evento.texto}</span>
                </div>
              ))}
            </div>

            <p className={css.panelPie}>Secuencia de demostración</p>
          </div>
        </div>

        <div className={css.proximos}>
          {PROXIMOS.map((p, i) => (
            <div key={i} className={css.proximo}>
              <span className={css.proximoNombre}>{p.nombre}</span>
              <span className={ui.estado} style={{ color: "var(--alerta)" }}>
                <i className={ui.punto} style={{ background: "var(--alerta)" }} />
                {p.estado}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
