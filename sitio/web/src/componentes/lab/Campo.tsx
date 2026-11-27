"use client";

import { useEffect, useRef } from "react";
import css from "./Campo.module.css";

const N = 900;
const PROPORCION = 3017 / 771; // viewBox del logotipo
/** Centro y color de los puntos de las dos i, en unidades del viewBox (lado 160, arriba). */
const PUNTOS_I = [
  { cx: 861, color: "#1f47c4" },
  { cx: 2024, color: "#0b0f17" },
];
const ETAPAS = ["Sus datos", "Adaptar", "Evaluar", "Servir"];
/** Milisegundos de cada etapa: la palabra final se queda más tiempo. */
const DURA = [2000, 2500, 2200, 4200];
const CICLO = DURA.reduce((a, b) => a + b);
const azar = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Posición (de -1 a 1) del cuadro i en la etapa e al tiempo t. */
function destino(e: number, i: number, t: number): [number, number] {
  if (e === 0) return [azar(i, 1) * 2 - 1, azar(i, 2) * 2 - 1];
  if (e === 1) {
    // tres órbitas alrededor de un núcleo: el entrenamiento
    const anillo = i % 3;
    const a = (i / N) * Math.PI * 6 + t * 0.00035 * (anillo + 1);
    const r = 0.3 + anillo * 0.3;
    return [Math.cos(a) * r, Math.sin(a) * r];
  }
  // retícula: los casos de prueba
  return [((i % 45) / 44) * 1.8 - 0.9, (Math.floor(i / 45) / 19) * 1.5 - 0.75];
}

type Punto = { x: number; y: number; color: string };

/** Muestrea el logotipo y devuelve, a lo más, N puntos de 0 a 1 con su color. */
function letras(img: HTMLImageElement): { puntos: Punto[]; paso: number } {
  const w = 400;
  const h = Math.round(w / PROPORCION);
  const g = Object.assign(document.createElement("canvas"), { width: w, height: h }).getContext("2d", {
    willReadFrequently: true,
  })!;
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  for (let paso = 3; ; paso += 0.1) {
    // Los puntos de las i se arman aparte para que ambos tengan la misma cantidad de cuadros.
    const lado = Math.round((160 / 3017) * w / paso);
    const puntos: Punto[] = PUNTOS_I.flatMap(({ cx, color }) =>
      Array.from({ length: lado * lado }, (_, i) => ({
        x: cx / 3017 + (((i % lado) - (lado - 1) / 2) * paso) / w,
        y: 80 / 771 + ((Math.floor(i / lado) - (lado - 1) / 2) * paso) / h,
        color,
      })),
    );
    for (let y = paso / 2; y < h; y += paso)
      for (let x = paso / 2; x < w; x += paso) {
        // A la derecha de la D, arriba de y = 220 solo están los puntos de las i.
        if (y / h < 220 / 771 && (x / w) * 3017 > 740) continue;
        const k = (Math.floor(y) * w + Math.floor(x)) * 4;
        if (d[k + 3] > 128) puntos.push({ x: x / w, y: y / h, color: d[k + 2] > d[k] + 60 ? "#1f47c4" : "#0b0f17" });
      }
    if (puntos.length <= N) return { puntos, paso: paso / w };
  }
}

/** Los mismos cuadros se reordenan: datos sueltos, modelo, pruebas y, al final, Dimia. */
export function Campo() {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const nombres = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const c = lienzo.current!;
    const g = c.getContext("2d")!;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pos: [number, number][] = [];
    const raton = { x: -999, y: -999 };
    let ancho = 0, alto = 0, cuadro = 0, visible = true, inicio = 0;

    let palabra: ReturnType<typeof letras> | null = null;
    const logotipo = new Image(400, 102);
    logotipo.onload = () => {
      palabra = letras(logotipo);
      if (quieto) {
        pintar(0);
        pintar(0); // la primera pasada fija el destino; la segunda ya dibuja la palabra completa
      }
    };
    logotipo.src = "/marca/logotipo-papel.svg";

    const medir = () => {
      const d = window.devicePixelRatio || 1;
      ancho = c.clientWidth;
      alto = c.clientHeight;
      c.width = ancho * d;
      c.height = alto * d;
      g.setTransform(d, 0, 0, d, 0, 0);
      if (quieto) pintar(0);
    };

    const pintar = (t: number) => {
      // Al entrar, la nube dura apenas un cuarto de segundo y enseguida se ordena.
      inicio ||= t - (DURA[0] - 250);
      let e = 3;
      if (!quieto) {
        let resto = (t - inicio) % CICLO;
        e = DURA.findIndex((d) => (resto -= d) < 0);
      }
      nombres.current?.querySelectorAll("li").forEach((li, i) => li.toggleAttribute("data-activa", i === e));
      g.clearRect(0, 0, ancho, alto);
      const rx = Math.min(ancho * 0.44, alto * 0.9);
      const ry = alto * 0.44;
      for (let i = 0; i < N; i++) {
        const letra = e === 3 && palabra?.puntos.length ? palabra.puntos[i % palabra.puntos.length] : null;
        const anchoPalabra = Math.min(ancho * 0.92, alto * PROPORCION * 0.8, 760);
        const [dx, dy] = letra
          ? [((letra.x - 0.5) * anchoPalabra) / rx, ((letra.y - 0.5) * anchoPalabra) / PROPORCION / ry]
          : destino(Math.min(e, 2), i, t);
        const k = quieto ? 1 : (letra ? 0.075 : 0.045) + azar(i, 3) * 0.07;
        // en la nube los cuadros flotan; al aparecer, llegan desde fuera
        const deriva = e === 0 && !quieto ? Math.sin(t * 0.0012 + i) * 14 : 0;
        const tx = dx * (e === 0 ? ancho * 0.48 : rx) + deriva;
        const ty = dy * ry - deriva;
        const p = (pos[i] ||= quieto ? [tx, ty] : [tx * 1.7, ty * 1.7]);
        p[0] += (tx - p[0]) * k;
        p[1] += (ty - p[1]) * k;
        let x = ancho / 2 + p[0];
        let y = alto / 2 + p[1];
        const d = Math.hypot(x - raton.x, y - raton.y);
        if (d < 90) {
          x += ((x - raton.x) / (d || 1)) * (90 - d) * 0.6;
          y += ((y - raton.y) / (d || 1)) * (90 - d) * 0.6;
        }
        const falla = e === 2 && azar(i, Math.floor(t / 700)) > 0.93;
        g.fillStyle = letra ? letra.color : falla ? "#c8a45c" : "#1f47c4";
        const lado = letra ? palabra!.paso * anchoPalabra * 0.86 : e === 2 ? 5 : 2 + azar(i, 4) * 3.5;
        g.fillRect(x - lado / 2, y - lado / 2, lado, lado);
      }
    };

    const girar = (t: number) => {
      if (visible) pintar(t);
      cuadro = requestAnimationFrame(girar);
    };
    const mover = (ev: PointerEvent) => {
      const r = c.getBoundingClientRect();
      raton.x = ev.clientX - r.left;
      raton.y = ev.clientY - r.top;
    };
    const soltar = () => {
      raton.x = raton.y = -999;
    };
    const alzar = (ev: PointerEvent) => {
      if (ev.pointerType !== "mouse") soltar();
    };
    const io = new IntersectionObserver(([x]) => (visible = x.isIntersecting));
    const ro = new ResizeObserver(medir);
    io.observe(c);
    ro.observe(c);
    medir();
    if (!quieto) {
      cuadro = requestAnimationFrame(girar);
      window.addEventListener("pointermove", mover, { passive: true });
      window.addEventListener("pointerup", alzar);
      window.addEventListener("pointercancel", soltar);
      document.documentElement.addEventListener("pointerleave", soltar);
    }
    return () => {
      cancelAnimationFrame(cuadro);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", alzar);
      window.removeEventListener("pointercancel", soltar);
      document.documentElement.removeEventListener("pointerleave", soltar);
    };
  }, []);

  return (
    <figure className={css.campo}>
      <canvas ref={lienzo} className={css.lienzo} aria-hidden="true" />
      <figcaption>
        <ol ref={nombres} className={css.etapas}>
          {ETAPAS.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ol>
      </figcaption>
    </figure>
  );
}
