"use client";

import { useEffect } from "react";

/**
 * Revela los elementos marcados con `data-revelar` cuando entran en pantalla.
 * Escalona hasta cuatro hermanos con 90 ms de diferencia.
 *
 * Dos salvaguardas para que el contenido nunca quede invisible:
 * el CSS solo lo esconde cuando este script marca la compuerta en <html>,
 * y a los 2.5 s se revela cualquier resto que el observador no haya atendido.
 */
export function useRevelar() {
  useEffect(() => {
    const raiz = document.documentElement;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (quieto || !("IntersectionObserver" in window)) return;

    raiz.dataset.revelado = "1";

    const revelar = (el: HTMLElement) => el.setAttribute("data-visible", "1");

    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (!entrada.isIntersecting) return;
          revelar(entrada.target as HTMLElement);
          observador.unobserve(entrada.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px" },
    );

    const elementos = Array.from(
      document.querySelectorAll<HTMLElement>("[data-revelar]:not([data-visible])"),
    );

    elementos.forEach((el) => {
      const hermanos = Array.from(
        el.parentElement?.querySelectorAll<HTMLElement>(":scope > [data-revelar]") ?? [],
      );
      el.style.transitionDelay = `${Math.min(hermanos.indexOf(el), 4) * 90}ms`;
      observador.observe(el);
    });

    // Red de seguridad: nada se queda escondido por un observador que no disparó.
    const red = window.setTimeout(() => {
      document
        .querySelectorAll<HTMLElement>("[data-revelar]:not([data-visible])")
        .forEach((el) => {
          const caja = el.getBoundingClientRect();
          if (caja.top < window.innerHeight) revelar(el);
        });
    }, 2500);

    return () => {
      observador.disconnect();
      window.clearTimeout(red);
      delete raiz.dataset.revelado;
    };
  }, []);
}
