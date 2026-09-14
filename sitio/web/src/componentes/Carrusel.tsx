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

  const tramo = (copia: number) => (
    <ul className={css.tramo} aria-hidden={copia > 0 ? "true" : undefined}>
      {CLIENTES.map((cliente) => {
        const usarLogo = cliente.logo && cargados[cliente.logo];
        return (
          <li key={cliente.nombre} className={css.celda}>
            {usarLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cliente.logo!}
                alt={copia > 0 ? "" : cliente.nombre}
                className={css.logo}
                style={{ height: cliente.alto ?? 36 }}
              />
            ) : (
              <span className={css.nombre}>{cliente.nombre}</span>
            )}
            <i className={css.separador} aria-hidden="true" />
          </li>
        );
      })}
    </ul>
  );

  return (
    <section aria-label="Confían en Dimia" className={`${ui.seccion} ${ui.tonoPanel2}`}>
      <div className={css.contenedor}>
        <div className={css.cabeza}>
          <p data-revelar className={ui.rotulo}>Confían en Dimia</p>
          <p className={css.nota}>{NOTA_CLIENTES}</p>
        </div>
      </div>

      {/* La cinta va de orilla a orilla; se duplica para el bucle sin salto. */}
      <div className={css.ventana}>
        <div className={css.pista}>
          {tramo(0)}
          {tramo(1)}
        </div>
      </div>
    </section>
  );
}
