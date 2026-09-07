import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Recorte } from "./Recorte";
import { aparecer, Fondo, suave } from "./componentes";
import { color } from "./marca";
import { cifras, interfaz, titular } from "./tipografia";

export const DURACION_TOTAL = 990; // 33 s a 30 fps

/** Rótulo de latón arriba, siempre en el mismo sitio. */
const Rotulo: React.FC<{ texto: string }> = ({ texto }) => {
  const f = useCurrentFrame();
  const o = aparecer(f, 6, 12);
  return (
    <div
      style={{
        position: "absolute",
        top: 120,
        left: 64,
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: o,
        transform: `translateX(${interpolate(o, [0, 1], [-16, 0])}px)`,
      }}
    >
      <div style={{ width: 13, height: 13, backgroundColor: color.laton }} />
      <span
        style={{
          fontFamily: cifras,
          fontSize: 24,
          letterSpacing: "0.32em",
          textTransform: "uppercase",
          color: color.laton,
        }}
      >
        {texto}
      </span>
    </div>
  );
};

/** Frase de abajo. Corta, en Archivo, con el cuadrado azul de remate. */
const Pie: React.FC<{ children: React.ReactNode; entrada?: number }> = ({ children, entrada = 10 }) => {
  const f = useCurrentFrame();
  const o = aparecer(f, entrada, 16);
  return (
    <div
      style={{
        position: "absolute",
        left: 64,
        right: 64,
        bottom: 150,
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [22, 0])}px)`,
      }}
    >
      <p
        style={{
          fontFamily: interfaz,
          fontWeight: 600,
          fontSize: 52,
          lineHeight: 1.2,
          letterSpacing: "-0.015em",
          color: color.hueso,
          margin: 0,
          textShadow: `0 2px 40px ${color.tinta}, 0 0 18px ${color.tinta}`,
        }}
      >
        {children}
        <span
          style={{ display: "inline-block", width: 14, height: 14, backgroundColor: color.azul, marginLeft: 14 }}
        />
      </p>
    </div>
  );
};

/** Velo de tinta arriba y abajo, para que el texto se lea sobre la interfaz. */
const Velo: React.FC = () => (
  <AbsoluteFill
    style={{
      background:
        `linear-gradient(to bottom, ${color.tinta} 0%, ${color.tinta}00 22%,` +
        ` ${color.tinta}00 62%, ${color.tinta}e6 88%, ${color.tinta} 100%)`,
    }}
  />
);

/** Cada plano se apaga en sus últimos fotogramas sobre el siguiente. */
const Plano: React.FC<{ duracion: number; children: React.ReactNode }> = ({ duracion, children }) => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 6, duracion - 10, duracion - 2], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return <AbsoluteFill style={{ opacity: o, backgroundColor: color.tinta }}>{children}</AbsoluteFill>;
};

// ------------------------------------------------------------------- ganchо

const Gancho: React.FC<{ duracion: number }> = ({ duracion }) => {
  const f = useCurrentFrame();
  return (
    <Plano duracion={duracion}>
      <Fondo />
      <AbsoluteFill style={{ padding: "0 70px", justifyContent: "center" }}>
        <h1
          style={{
            fontFamily: titular,
            fontWeight: 300,
            fontSize: 96,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: color.hueso,
            margin: 0,
            opacity: aparecer(f, 2, 14),
            transform: `translateY(${interpolate(aparecer(f, 2, 14), [0, 1], [24, 0])}px)`,
          }}
        >
          Contesta
          <br />
          al segundo
          <span
            style={{ display: "inline-block", width: 18, height: 18, backgroundColor: color.azul, marginLeft: 18 }}
          />
        </h1>
      </AbsoluteFill>
    </Plano>
  );
};

// ------------------------------------------------------------------- cierre

const Cierre: React.FC<{ duracion: number }> = ({ duracion }) => {
  const f = useCurrentFrame();
  const logo = aparecer(f, 4, 20);
  const linea = interpolate(f, [26, 54], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: suave });
  return (
    <Plano duracion={duracion}>
      <Fondo deriva={200} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 70px" }}>
        <Img
          src={staticFile("logotipo-dimia-tinta.svg")}
          style={{ width: 560, opacity: logo, transform: `translateY(${interpolate(logo, [0, 1], [16, 0])}px)` }}
        />
        <div style={{ width: 560 * linea, height: 1, backgroundColor: `${color.hueso}2e`, margin: "48px 0" }} />
        <div style={{ opacity: aparecer(f, 44, 20), textAlign: "center" }}>
          <div style={{ fontFamily: interfaz, fontWeight: 500, fontSize: 38, color: color.hueso }}>
            Donde el dato decide
          </div>
          <div style={{ fontFamily: cifras, fontSize: 24, letterSpacing: "0.26em", color: color.azul, marginTop: 28 }}>
            dimia.mx
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 150,
            left: 0,
            right: 0,
            textAlign: "center",
            opacity: aparecer(f, 78, 20),
            fontFamily: cifras,
            fontSize: 22,
            letterSpacing: "0.16em",
            color: `${color.hueso}70`,
          }}
        >
          esta voz también es inteligencia artificial
        </div>
      </AbsoluteFill>
    </Plano>
  );
};

// -------------------------------------------------------------------- guion

/**
 * Seis planos. Los cuatro de en medio son recortes verticales de la grabación
 * de pantalla; el primero y el último se dibujan.
 */
const GUION = [
  { desde: 0, duracion: 62, Plano: Gancho },
  {
    desde: 48,
    duracion: 222,
    rotulo: "El panel",
    pie: "Todo lo que atendió, en un lugar",
    video: { desde: 4.3, foco: [0.30, 0.40] as [number, number], focoFin: [0.27, 0.52] as [number, number], zoom: 1.0, zoomFin: 1.10, recorrido: 210 },
  },
  {
    desde: 258,
    duracion: 234,
    rotulo: "Contesta",
    pie: "La llamada queda escrita",
    video: { desde: 25.6, foco: [0.62, 0.44] as [number, number], focoFin: [0.66, 0.60] as [number, number], zoom: 1.0, zoomFin: 1.12, recorrido: 222 },
  },
  {
    desde: 480,
    duracion: 246,
    rotulo: "Agenda",
    pie: "Y la cita ya está escrita",
    video: { desde: 40.2, foco: [0.32, 0.50] as [number, number], focoFin: [0.38, 0.62] as [number, number], zoom: 1.0, zoomFin: 1.14, recorrido: 234 },
  },
  {
    desde: 714,
    duracion: 168,
    rotulo: "Mide",
    pie: "Y usted ve qué pasó",
    video: { desde: 53.2, foco: [0.42, 0.38] as [number, number], focoFin: [0.46, 0.52] as [number, number], zoom: 1.04, zoomFin: 1.16, recorrido: 156 },
  },
  { desde: 870, duracion: 120, Plano: Cierre },
] as const;

export const Reel: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: color.tinta }}>
    <Audio src={staticFile("pista.mp3")} />
    {GUION.map((p, i) => (
      <Sequence key={i} from={p.desde} durationInFrames={p.duracion}>
        {"Plano" in p ? (
          <p.Plano duracion={p.duracion} />
        ) : (
          <Plano duracion={p.duracion}>
            <Recorte {...p.video} />
            <Velo />
            <Rotulo texto={p.rotulo} />
            <Pie>{p.pie}</Pie>
          </Plano>
        )}
      </Sequence>
    ))}
  </AbsoluteFill>
);
