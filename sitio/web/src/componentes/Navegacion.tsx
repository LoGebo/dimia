"use client";

import { useEffect, useState } from "react";
import { FIRMA, NAVEGACION } from "@/contenido/sitio";
import { Flecha, IconoDimia } from "./Iconos";
import css from "./Navegacion.module.css";

export function Navegacion() {
  const [compacta, setCompacta] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const alScroll = () => setCompacta(window.scrollY > 40);
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [menu]);

  return (
    <>
      <header className={css.barra} data-compacta={compacta ? "1" : "0"}>
        <div className={css.interior}>
          <a href="#inicio" aria-label={FIRMA.nombre} className={css.marca}>
            <IconoDimia tamano={30} />
          </a>

          <nav className={css.enlaces} aria-label="Principal">
            {NAVEGACION.map((e) => (
              <a key={e.href} href={e.href} className={css.enlace}>
                {e.texto}
              </a>
            ))}
            <a href="#contacto" className={css.agendar}>
              Agendar
              <Flecha />
            </a>
          </nav>

          <div className={css.movil}>
            <a href="#contacto" className={css.agendarCorto}>
              Agendar
            </a>
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-label={menu ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menu}
              aria-controls="menu-movil"
              className={css.botonMenu}
            >
              <span className={css.rejilla}>
                <i className={css.cuadroAzul} />
                <i className={css.cuadro} />
                <i className={css.cuadro} />
                <i className={css.cuadro} />
              </span>
            </button>
          </div>
        </div>
      </header>

      {menu && (
        <div id="menu-movil" className={css.panelMenu}>
          {NAVEGACION.map((e) => (
            <a key={e.href} href={e.href} onClick={() => setMenu(false)} className={css.enlaceMenu}>
              {e.texto}
            </a>
          ))}
          <a href="#contacto" onClick={() => setMenu(false)} className={css.agendarMenu}>
            Agendar una demostración
            <Flecha />
          </a>
          <p className={css.pieMenu}>
            {FIRMA.correo} · {FIRMA.telefono}
          </p>
        </div>
      )}
    </>
  );
}
