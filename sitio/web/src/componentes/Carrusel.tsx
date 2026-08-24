"use client";

import { useState } from "react";
import { CLIENTES, NOTA_CLIENTES } from "@/contenido/sitio";
import { Flecha } from "./Iconos";
import ui from "./ui.module.css";
import css from "./Carrusel.module.css";

const POR_PAGINA = 5;

export function Carrusel() {
  const [pagina, setPagina] = useState(0);
  const paginas: (typeof CLIENTES)[] = [];
  for (let i = 0; i < CLIENTES.length; i += POR_PAGINA) {
    paginas.push(CLIENTES.slice(i, i + POR_PAGINA));
  }
  const total = Math.max(paginas.length, 1);

  return (
    <section aria-label="Confían en Dimia" className={ui.seccion}>
      <div className={css.contenedor}>
        <div className={css.barra}>
          <p className={ui.rotulo}>Confían en Dimia</p>
          <div className={css.controles}>
            <button
              type="button"
              onClick={() => setPagina((p) => (p === 0 ? total - 1 : p - 1))}
              aria-label="Anterior"
              className={css.control}
            >
              <Flecha invertida />
            </button>
            <button
              type="button"
              onClick={() => setPagina((p) => (p === total - 1 ? 0 : p + 1))}
              aria-label="Siguiente"
              className={css.control}
            >
              <Flecha />
            </button>
          </div>
        </div>

        <div className={css.ventana}>
          <div className={css.pista} style={{ transform: `translateX(-${pagina * 100}%)` }}>
            {paginas.map((grupo, i) => (
              <div key={i} className={css.pagina} aria-hidden={i !== pagina}>
                {grupo.map((cliente, j) => (
                  <div key={j} className={css.celda}>
                    {cliente.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={cliente.logo} alt={cliente.nombre} className={css.logo} />
                    ) : (
                      <span className={css.marcador}>{cliente.nombre}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className={css.pie}>
          <p className={css.nota}>{NOTA_CLIENTES}</p>
          <div className={css.puntos}>
            {paginas.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPagina(i)}
                aria-label={`Página ${i + 1}`}
                aria-current={i === pagina}
                className={css.botonPunto}
              >
                <i className={css.punto} data-activo={i === pagina ? "1" : "0"} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
