"use client";

import { useEffect, useState } from "react";
import { CONVERSACIONES } from "@/contenido/sitio";
import css from "./Escena.module.css";

/*
 * Una llamada en tres tarjetas sobre el cuadrado azul:
 * 0 entra la llamada · 1 el agente conversa · 2 la reserva queda escrita.
 * Datos de ejemplo de un restaurante. Con movimiento reducido se ven las tres.
 */
const LLAMADA = CONVERSACIONES[0];
const LINEAS = LLAMADA.lineas.slice(0, 3);
const TIEMPOS = [1600, 900, 1300, 1300, 1500, 4200]; // entra · línea 1 · 2 · 3 · comprobante · pausa

export function Escena() {
  const [paso, setPaso] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPaso(TIEMPOS.length - 1);
      return;
    }
    const reloj = window.setTimeout(() => setPaso((p) => (p + 1) % TIEMPOS.length), TIEMPOS[paso]);
    return () => window.clearTimeout(reloj);
  }, [paso]);

  const lineasVisibles = Math.max(0, Math.min(LINEAS.length, paso - 0));
  const confirmada = paso >= 4;

  return (
    <div className={css.escena} aria-label="Ejemplo: una llamada atendida por el agente fuera de horario">
      <div className={css.entrante} data-estado={confirmada ? "colgada" : "activa"}>
        <p className={css.etiqueta}>
          <i aria-hidden="true" />
          {confirmada ? "Llamada terminada" : "Llamada entrante"}
        </p>
        <p className={css.numero}>+52 81 •••• 4410</p>
        <p className={css.contexto}>
          <span>21:04</span> Su negocio ya cerró. Contesta el agente.
        </p>
      </div>

      <div className={css.dialogo}>
        {LINEAS.map((l, i) => (
          <p key={i} className={css.linea} data-quien={l.quien} data-visible={i < lineasVisibles ? "1" : "0"}>
            <span className={css.quien}>{l.quien === "agente" ? "Agente" : "Cliente"}</span>
            {l.texto}
          </p>
        ))}
      </div>

      <div className={css.comprobante} data-visible={confirmada ? "1" : "0"}>
        <p className={css.compEstado}>
          <i aria-hidden="true" />
          {LLAMADA.resultado.tipo} confirmada
        </p>
        <p className={css.compHora}>{LLAMADA.resultado.hora}</p>
        <p className={css.compDia}>
          {LLAMADA.resultado.dia} · {LLAMADA.resultado.detalle}
        </p>
        <p className={css.compPie}>
          <span>#A-2291</span>
          Enviada por WhatsApp
        </p>
      </div>
    </div>
  );
}
