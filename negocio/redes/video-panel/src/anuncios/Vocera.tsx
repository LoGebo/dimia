import React from "react";
import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { cifras, interfaz } from "../tipografia";

/**
 * Video de vocera: Valentina (avatar de Marketing Studio) presenta Dimia en formato UGC.
 * Replica el ganador de Rosie 1942794963041305: subtítulos palabra por palabra al centro,
 * persona a cámara todo el tiempo y cierre con botón.
 * El aviso «Presentador generado con IA» va fijo todo el video: nadie debe creer que es del equipo.
 * Guion en negocio/redes/anuncios-pauta/video-vocero.md.
 */

export type Palabra = { texto: string; desde: number; hasta: number };

export type VoceraProps = {
  /** Duración del video crudo en segundos. */
  duracion: number;
  /** Transcripción con tiempos en segundos. */
  palabras: Palabra[];
};

const C = {
  tinta: "#0b0f17",
  hueso: "#eef1f7",
  acero: "#97a2b5",
  azul: "#6e9bf5",
  sobreAzul: "#0b1220",
} as const;

const CIERRE = 2.6; // segundos de placa final

/** Muestra la palabra actual y hasta dos anteriores de la misma frase; la actual en azul. */
const Subtitulo: React.FC<{ palabras: Palabra[] }> = ({ palabras }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const i = palabras.findIndex((p) => t >= p.desde && t < p.hasta + 0.15);
  if (i < 0) return null;
  const inicio = Math.max(0, i - 2);
  const grupo = palabras.slice(inicio, i + 1);
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: 1180, textAlign: "center" }}>
      {grupo.map((p, k) => {
        const actual = inicio + k === i;
        return (
          <span
            key={`${inicio + k}`}
            style={{
              fontFamily: interfaz,
              fontWeight: 800,
              fontSize: actual ? 92 : 78,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              color: actual ? C.sobreAzul : C.hueso,
              backgroundColor: actual ? C.azul : `${C.tinta}b3`,
              padding: "2px 14px",
              margin: "0 6px",
              display: "inline-block",
            }}
          >
            {p.texto}
          </span>
        );
      })}
    </div>
  );
};

const Aviso: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 40,
      top: 290,
      backgroundColor: `${C.tinta}cc`,
      padding: "10px 16px",
      fontFamily: cifras,
      fontSize: 22,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: C.hueso,
    }}
  >
    Presentador generado con IA
  </div>
);

const Placa: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ backgroundColor: C.tinta, opacity: o, alignItems: "center", justifyContent: "center" }}>
      <Img src={staticFile("marca/logotipo-dimia-tinta.svg")} style={{ width: 560 }} />
      <div
        style={{
          marginTop: 70,
          backgroundColor: C.azul,
          color: C.sobreAzul,
          fontFamily: interfaz,
          fontWeight: 700,
          fontSize: 46,
          padding: "30px 48px",
        }}
      >
        Agendar demostración →
      </div>
      <div style={{ marginTop: 40, fontFamily: cifras, fontSize: 32, letterSpacing: "0.24em", color: C.azul }}>dimia.mx</div>
    </AbsoluteFill>
  );
};

export const Vocera: React.FC<VoceraProps> = ({ duracion, palabras }) => {
  const { fps } = useVideoConfig();
  const video = Math.round(duracion * fps);
  return (
    <AbsoluteFill style={{ backgroundColor: C.tinta }}>
      <Sequence durationInFrames={video}>
        <OffthreadVideo src={staticFile("pauta/videos/valentina-crudo.mp4")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <Subtitulo palabras={palabras} />
        <Aviso />
      </Sequence>
      <Sequence from={video} durationInFrames={Math.round(CIERRE * fps)}>
        <Placa />
      </Sequence>
    </AbsoluteFill>
  );
};

export const duracionVocera = (duracion: number, fps: number) => Math.round((duracion + CIERRE) * fps);
