"use client";

import { useEffect, useRef, useState } from "react";
import { PASOS_LLAMADA } from "@/contenido/sitio";

export type Fase = "espera" | "llamada" | "confirmada";
export type Evento = { t: string; texto: string };

const RELOJ_FINAL = 42_000;

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Secuencia de demostración del agente de voz.
 * Con `prefers-reduced-motion` se queda quieta en el estado confirmado,
 * con la bitácora completa: el visitante ve el resultado sin movimiento.
 */
export function usePanelLlamada() {
  const [fase, setFase] = useState<Fase>("espera");
  const [ms, setMs] = useState(0);
  const [folio, setFolio] = useState("—");
  const [bitacora, setBitacora] = useState<Evento[]>([]);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (quieto) {
      setFase("confirmada");
      setMs(RELOJ_FINAL);
      setFolio("#A-2291");
      setBitacora(
        PASOS_LLAMADA.filter((p) => p.texto).map((p, i) => ({
          t: mmss(i * 5200),
          texto: p.texto as string,
        })),
      );
      return;
    }

    let faseActual: Fase = "espera";
    let msActual = 0;

    intervalo.current = setInterval(() => {
      if (faseActual === "llamada") {
        msActual += 760;
        setMs(msActual);
      }
    }, 100);

    const correr = (i: number) => {
      const paso = PASOS_LLAMADA[i % PASOS_LLAMADA.length];
      temporizador.current = setTimeout(() => {
        if (paso.fase === "reinicio") {
          faseActual = "espera";
          msActual = 0;
          setFase("espera");
          setMs(0);
          setFolio("—");
          setBitacora([]);
        } else {
          const siguiente = paso.fase as Fase;
          if (siguiente === "confirmada" && faseActual !== "confirmada") {
            msActual = RELOJ_FINAL;
            setMs(msActual);
          }
          faseActual = siguiente;
          setFase(siguiente);
          if ("folio" in paso && paso.folio) setFolio(paso.folio);
          if (paso.texto) {
            const marca = mmss(msActual);
            const texto = paso.texto;
            setBitacora((previa) => [...previa, { t: marca, texto }].slice(-6));
          }
        }
        correr(i + 1);
      }, paso.d);
    };

    correr(0);

    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
      if (intervalo.current) clearInterval(intervalo.current);
    };
  }, []);

  return { fase, reloj: mmss(ms), folio, bitacora };
}
