"use client";

import { useEffect, useState } from "react";
import { CLIENTES, NOTA_CLIENTES } from "@/contenido/sitio";
import ui from "./ui.module.css";
import css from "./Carrusel.module.css";

export function Carrusel() {
  // Se muestra el nombre por defecto y solo se cambia al logo cuando el archivo
  // carga de verdad (precarga). Así nunca aparece un ícono de imagen rota.
  const [cargados, setCargados] = useState<Record<string, true>>({});

  useEffect(() => {
    CLIENTES.forEach((c) => {
      if (!c.logo) return;
      const img = new Image();
      img.onload = () => setCargados((prev) => ({ ...prev, [c.logo!]: true }));
      img.src = c.logo;
    });
  }, []);

  // Se duplica la lista para que el desplazamiento sea continuo y sin salto.
  const cinta = [...CLIENTES, ...CLIENTES];

  return (
    <section aria-label="Confían en Dimia" className={`${ui.seccion} ${ui.tonoPanel2}`}>
      <div className={css.contenedor}>
        <p data-revelar className={ui.rotulo}>Confían en Dimia</p>

        <div className={css.ventana}>
          <div className={css.pista} aria-hidden="false">
            {cinta.map((cliente, i) => {
              const usarLogo = cliente.logo && cargados[cliente.logo];
              return (
                <div key={`${cliente.nombre}-${i}`} className={css.celda}>
                  {usarLogo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cliente.logo!} alt={cliente.nombre} className={css.logo} />
                  ) : (
                    <span className={css.marcador}>{cliente.nombre}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <p className={css.nota}>{NOTA_CLIENTES}</p>
      </div>
    </section>
  );
}
