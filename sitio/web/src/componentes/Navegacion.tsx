"use client";

import { useEffect, useState } from "react";
import { FIRMA, NAVEGACION } from "@/contenido/sitio";
import css from "./Navegacion.module.css";

export function Navegacion() {
  const [compacta, setCompacta] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const alScroll = () => setCompacta(window.scrollY > 24);
    alScroll();
    window.addEventListener("scroll", alScroll, { passive: true });
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    if (!menu) return;
    const alEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", alEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", alEscape);
    };
  }, [menu]);

  return (
    <header className={css.barra} data-compacta={compacta || menu ? "1" : "0"}>
      <div className={css.interior}>
        <a href="#inicio" aria-label={`${FIRMA.nombre}, inicio`} className={css.marca} onClick={() => setMenu(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logotipo-tinta.svg" alt="" width={3017} height={771} className={css.logotipo} />
        </a>

        <nav className={css.enlaces} aria-label="Principal">
          {NAVEGACION.map((e) => (
            <a key={e.href} href={e.href} className={css.enlace}>
              {e.texto}
            </a>
          ))}
        </nav>

        <a href="#contacto" className={css.agendar}>
          Agendar demostración
        </a>

        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-label={menu ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={menu}
          aria-controls="menu-movil"
          className={css.botonMenu}
        >
          <span className={css.barras} data-abierto={menu ? "1" : "0"} aria-hidden="true">
            <i />
            <i />
          </span>
        </button>
      </div>

      {menu && (
        <nav id="menu-movil" className={css.panelMenu} aria-label="Menú">
          {NAVEGACION.map((e) => (
            <a key={e.href} href={e.href} onClick={() => setMenu(false)} className={css.enlaceMenu}>
              {e.texto}
            </a>
          ))}
          <a href="#contacto" onClick={() => setMenu(false)} className={css.agendarMenu}>
            Agendar demostración
          </a>
          <a href={FIRMA.telefonoHref} className={css.telefonoMenu}>
            {FIRMA.telefono}
          </a>
        </nav>
      )}
    </header>
  );
}
