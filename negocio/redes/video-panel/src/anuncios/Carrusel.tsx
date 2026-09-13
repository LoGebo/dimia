import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { cifras, interfaz } from "../tipografia";

/**
 * Carrusel 1:1 que replica el de Rosie (ID 1328177095451777, activo desde el 23 jun 2026,
 * 82 días y 2 duplicados al 13 sep): «Missed Calls = Missed Customers» y
 * «Hiring More Isn't Always the Answer». La tercera tarjeta es el cierre de Dimia.
 * Adaptado a la marca: papel en vez de lila, azul hondo en vez de morado, esquinas rectas.
 */

export type CarruselProps = { tarjeta: 1 | 2 | 3 };

const C = {
  papel: "#f2f4f8",
  blanco: "#ffffff",
  tinta: "#0b0f17",
  tinta2: "#5a6478",
  linea: "#dfe3ea",
  linea2: "#c7ceda",
  hondo: "#1f47c4",
  laton: "#a8853f",
  rojo: "#c4392f",
  verde: "#12805c",
} as const;

const titulo: React.CSSProperties = {
  fontFamily: interfaz,
  fontWeight: 800,
  fontSize: 96,
  lineHeight: 1.0,
  letterSpacing: "-0.04em",
  color: C.tinta,
  margin: 0,
};

// ------------------------------------------------------------------ notificación

type Aviso = { x: number; y: number; giro: number; ancho: number; iniciales: string; tono: string; texto: string; lejos?: boolean };

const Notificacion: React.FC<{ a: Aviso; estado: "perdida" | "agendada" }> = ({ a, estado }) => (
  <div
    style={{
      position: "absolute",
      left: a.x,
      top: a.y,
      width: a.ancho,
      height: 104,
      transform: `rotate(${a.giro}deg)`,
      backgroundColor: C.blanco,
      border: `2px solid ${C.linea}`,
      display: "flex",
      alignItems: "center",
      gap: 22,
      padding: "0 22px",
      boxSizing: "border-box",
      opacity: a.lejos ? 0.45 : 1,
      filter: a.lejos ? "blur(3px)" : "none",
    }}
  >
    <div
      style={{
        width: 62,
        height: 62,
        flex: "none",
        backgroundColor: a.tono,
        color: C.blanco,
        fontFamily: interfaz,
        fontWeight: 700,
        fontSize: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {a.iniciales}
    </div>
    <span style={{ flex: 1, fontFamily: interfaz, fontWeight: 600, fontSize: 34, color: C.tinta, whiteSpace: "nowrap" }}>{a.texto}</span>
    <div
      style={{
        width: 58,
        height: 58,
        flex: "none",
        backgroundColor: estado === "perdida" ? C.rojo : C.verde,
        color: C.blanco,
        fontFamily: interfaz,
        fontWeight: 700,
        fontSize: estado === "perdida" ? 40 : 30,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {estado === "perdida" ? "×" : "✓"}
    </div>
  </div>
);

const CASCADA: Aviso[] = [
  { x: -140, y: 430, giro: 12, ancho: 560, iniciales: "RM", tono: C.laton, texto: "Paciente nuevo", lejos: true },
  { x: 600, y: 400, giro: -6, ancho: 520, iniciales: "KA", tono: C.tinta2, texto: "Cliente nuevo", lejos: true },
  { x: 620, y: 760, giro: 5, ancho: 520, iniciales: "JS", tono: C.tinta2, texto: "Cliente nuevo", lejos: true },
  { x: -100, y: 960, giro: -4, ancho: 540, iniciales: "AV", tono: C.tinta2, texto: "Cliente nuevo", lejos: true },
  { x: 400, y: 500, giro: 8, ancho: 620, iniciales: "LG", tono: C.hondo, texto: "Llamada perdida · 21:47" },
  { x: 40, y: 650, giro: -9, ancho: 600, iniciales: "P", tono: C.laton, texto: "Paciente nuevo" },
  { x: 330, y: 810, giro: 10, ancho: 640, iniciales: "TC", tono: C.hondo, texto: "Llamada perdida · 22:05" },
  { x: 60, y: 950, giro: -7, ancho: 560, iniciales: "MR", tono: C.laton, texto: "Paciente nuevo" },
];

const ORDEN: Aviso[] = [
  { x: 90, y: 470, giro: 0, ancho: 900, iniciales: "LG", tono: C.hondo, texto: "Cita agendada · jue 11:00" },
  { x: 90, y: 594, giro: 0, ancho: 900, iniciales: "P", tono: C.laton, texto: "Cita agendada · jue 12:30" },
  { x: 90, y: 718, giro: 0, ancho: 900, iniciales: "TC", tono: C.tinta2, texto: "Visita agendada · sáb 10:00" },
];

// ------------------------------------------------------------------ siluetas

/** Persona hecha con cuadrados: cabeza cuadrada y torso rectangular, como pide la marca. */
const Silueta: React.FC<{ color: string; tam?: number }> = ({ color, tam = 1 }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 * tam }}>
    <div style={{ width: 58 * tam, height: 58 * tam, backgroundColor: color }} />
    <div style={{ width: 110 * tam, height: 64 * tam, backgroundColor: color }} />
  </div>
);

// ------------------------------------------------------------------ tarjetas

const Tarjeta1: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.papel, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 80, top: 100 }}>
      <h1 style={titulo}>Llamadas perdidas =</h1>
      <h1 style={{ ...titulo, color: C.hondo }}>clientes perdidos</h1>
    </div>
    {CASCADA.filter((a) => a.lejos).map((a, i) => (
      <Notificacion key={`l${i}`} a={a} estado="perdida" />
    ))}
    {CASCADA.filter((a) => !a.lejos).map((a, i) => (
      <Notificacion key={`c${i}`} a={a} estado="perdida" />
    ))}
  </AbsoluteFill>
);

const Tarjeta2: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.papel, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 80, top: 90, right: 40 }}>
      <h1 style={{ ...titulo, fontSize: 80 }}>Contratar más personal</h1>
      <h1 style={{ ...titulo, fontSize: 80, marginTop: 10 }}>
        <span style={{ backgroundColor: C.hondo, color: C.blanco, padding: "0 14px" }}>no siempre</span> es la respuesta
      </h1>
    </div>
    <div
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        top: 400,
        height: 460,
        backgroundColor: C.blanco,
        border: `2px solid ${C.linea}`,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        alignItems: "center",
        justifyItems: "center",
        padding: "30px 40px",
        boxSizing: "border-box",
      }}
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <Silueta key={i} color={C.linea2} tam={0.9} />
      ))}
    </div>
    <div
      style={{
        position: "absolute",
        right: 110,
        top: 560,
        width: 260,
        height: 330,
        backgroundColor: C.hondo,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
      }}
    >
      <span style={{ fontFamily: cifras, fontWeight: 500, fontSize: 44, color: C.blanco, letterSpacing: "0.08em" }}>$ $ $</span>
      <Silueta color={C.blanco} />
    </div>
  </AbsoluteFill>
);

const Tarjeta3: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.papel, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 80, top: 100 }}>
      <h1 style={titulo}>Dimia contesta</h1>
      <h1 style={{ ...titulo, color: C.hondo }}>cada llamada.</h1>
    </div>
    {ORDEN.map((a, i) => (
      <Notificacion key={i} a={a} estado="agendada" />
    ))}
    <div style={{ position: "absolute", left: 90, right: 90, bottom: 80, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div
        style={{
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
      <Img src={staticFile("marca/logotipo-dimia-papel.svg")} style={{ width: 190 }} />
    </div>
  </AbsoluteFill>
);

export const Carrusel: React.FC<CarruselProps> = ({ tarjeta }) =>
  tarjeta === 1 ? <Tarjeta1 /> : tarjeta === 2 ? <Tarjeta2 /> : <Tarjeta3 />;
