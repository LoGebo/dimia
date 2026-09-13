import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { cifras, interfaz, titular } from "../tipografia";

/**
 * Réplica del estático de Weave «Voicemail is dead.» (ID 1364051085798343).
 * Ojo: al 13 sep 2026 solo llevaba 2 días activo; va como prueba, no como ganador.
 * Estructura: logotipo arriba, afirmación grande, bajada con lo que hace, dos teléfonos
 * (saludo del agente y chat de agendado) y botón. Fondo papel en vez de degradado.
 * El agente se presenta como asistente del negocio: nunca finge ser persona.
 */

const C = {
  papel: "#f2f4f8",
  blanco: "#ffffff",
  tinta: "#0b0f17",
  panel: "#111723",
  tinta2: "#5a6478",
  linea: "#dfe3ea",
  hondo: "#1f47c4",
  azul: "#6e9bf5",
} as const;

/** Maqueta de teléfono. Las curvas son del aparato que se retrata, no de la marca. */
const Telefono: React.FC<{ x: number; y: number; giro: number; oscuro?: boolean; children: React.ReactNode }> = ({ x, y, giro, oscuro, children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: 380,
      height: 780,
      transform: `rotate(${giro}deg)`,
      borderRadius: 62,
      border: "12px solid #1b1f27",
      backgroundColor: oscuro ? C.tinta : C.blanco,
      overflow: "hidden",
      boxSizing: "border-box",
    }}
  >
    <div style={{ position: "absolute", left: "50%", top: 16, width: 110, height: 30, marginLeft: -55, borderRadius: 16, backgroundColor: "#1b1f27" }} />
    {children}
  </div>
);

export const Buzon: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.papel, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 70, display: "flex", justifyContent: "center" }}>
      <Img src={staticFile("marca/logotipo-dimia-papel.svg")} style={{ width: 210 }} />
    </div>
    <h1
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 170,
        margin: 0,
        textAlign: "center",
        fontFamily: titular,
        fontWeight: 300,
        fontSize: 82,
        letterSpacing: "-0.02em",
        whiteSpace: "nowrap",
        color: C.tinta,
      }}
    >
      El buzón de voz ya murió.
    </h1>
    <p
      style={{
        position: "absolute",
        left: 110,
        right: 110,
        top: 300,
        margin: 0,
        textAlign: "center",
        fontFamily: interfaz,
        fontSize: 36,
        lineHeight: 1.35,
        color: C.tinta2,
      }}
    >
      Conteste cada llamada 24/7, agende y reagende citas y resuelva preguntas frecuentes con Dimia.
    </p>

    <Telefono x={110} y={540} giro={-6} oscuro>
      <div style={{ position: "absolute", left: 34, right: 30, top: 150, fontFamily: interfaz }}>
        <div style={{ width: 22, height: 22, backgroundColor: C.azul }} />
        <p style={{ fontFamily: titular, fontWeight: 300, fontSize: 32, lineHeight: 1.22, color: "#eef1f7", margin: "22px 0 0" }}>
          Buenas tardes, le atiende el asistente de Clínica Roma. ¿En qué le ayudo?
        </p>
      </div>
      <div style={{ position: "absolute", left: 34, right: 34, top: 440, display: "flex", alignItems: "flex-end", gap: 8, height: 90 }}>
        {[34, 62, 44, 80, 52, 90, 40, 70, 30, 58, 46, 76].map((h, i) => (
          <div key={i} style={{ flex: 1, height: h, backgroundColor: i % 3 === 0 ? C.azul : "#2f3a4d" }} />
        ))}
      </div>
      <div style={{ position: "absolute", left: 34, top: 560, fontFamily: cifras, fontSize: 18, color: "#97a2b5", letterSpacing: "0.1em" }}>EN LLAMADA · 00:18</div>
    </Telefono>

    <Telefono x={570} y={620} giro={4}>
      <div style={{ position: "absolute", left: 26, right: 26, top: 70, fontFamily: interfaz, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: cifras, fontSize: 20, color: C.tinta2, textAlign: "center", marginBottom: 10 }}>15:12</div>
        {[
          { yo: false, t: "¿Tienen espacio mañana?" },
          { yo: true, t: "Sí, a las 15:30. ¿Le funciona?" },
          { yo: false, t: "Perfecto, gracias." },
        ].map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.yo ? "flex-end" : "flex-start",
              maxWidth: "82%",
              backgroundColor: m.yo ? C.hondo : C.papel,
              color: m.yo ? C.blanco : C.tinta,
              border: m.yo ? "none" : `1px solid ${C.linea}`,
              fontSize: 24,
              lineHeight: 1.3,
              padding: "12px 14px",
            }}
          >
            {m.t}
          </div>
        ))}
      </div>
    </Telefono>

    <div
      style={{
        position: "absolute",
        right: 70,
        bottom: 60,
        backgroundColor: C.hondo,
        color: C.blanco,
        fontFamily: interfaz,
        fontWeight: 700,
        fontSize: 38,
        padding: "26px 38px",
        display: "flex",
        gap: 22,
      }}
    >
      Agendar demostración <span>→</span>
    </div>
  </AbsoluteFill>
);
