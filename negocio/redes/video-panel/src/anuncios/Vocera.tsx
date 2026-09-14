import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { cifras, interfaz } from "../tipografia";

/**
 * Reel de vocero: Marco (avatar de Marketing Studio) presenta Dimia en formato UGC.
 * Replica el ganador de Rosie 1942794963041305 y le suma producción de reel:
 * acercamiento en cada frase, apariciones del panel en marco de teléfono, notificaciones,
 * golpes de sonido y subtítulos palabra por palabra.
 * El aviso «Presentador generado con IA» va fijo: nadie debe creer que es del equipo.
 * Guion en negocio/redes/anuncios-pauta/video-vocero.md.
 */

export type Palabra = { texto: string; desde: number; hasta: number };

/** Recurso que aparece encima del vocero en un momento del video (segundos). */
export type Recurso =
  | { tipo: "panel"; desde: number; hasta: number; captura: string }
  | { tipo: "aviso"; desde: number; hasta: number; titulo: string; texto: string; tono: "azul" | "verde" | "rojo" };

export type VoceraProps = {
  video: string;
  /** Duración del video crudo en segundos. */
  duracion: number;
  palabras: Palabra[];
  /** Segundos donde empieza cada frase: ahí cambia el acercamiento. */
  cortes?: number[];
  recursos?: Recurso[];
};

const C = {
  tinta: "#0b0f17",
  panel: "#111723",
  hueso: "#eef1f7",
  acero: "#97a2b5",
  azul: "#6e9bf5",
  sobreAzul: "#0b1220",
  verde: "#3fb68b",
  rojo: "#e2685c",
} as const;

const CIERRE = 2.6;
const suave = Easing.bezier(0.16, 1, 0.3, 1);

// ------------------------------------------------------------------ vocero con acercamientos

/** Alterna encuadre abierto y cerrado en cada frase, con un pequeño empuje continuo. */
const Encuadre: React.FC<{ video: string; cortes: number[] }> = ({ video, cortes }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const tramo = cortes.filter((c) => c <= t).length;
  const inicio = cortes.filter((c) => c <= t).pop() ?? 0;
  const base = tramo % 2 === 0 ? 1 : 1.18;
  const empuje = interpolate(t - inicio, [0, 4], [0, 0.04], { extrapolateRight: "clamp" });
  const golpe = interpolate(t - inicio, [0, 0.12], [0.04, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile(video)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${base + empuje + golpe})`,
          transformOrigin: "50% 38%",
        }}
      />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ subtítulos

const Subtitulo: React.FC<{ palabras: Palabra[] }> = ({ palabras }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  const i = palabras.findIndex((p) => t >= p.desde && t < p.hasta + 0.15);
  if (i < 0) return null;
  const inicio = Math.max(0, i - 2);
  const grupo = palabras.slice(inicio, i + 1);
  const entra = interpolate(t - palabras[i].desde, [0, 0.08], [0.85, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", left: 50, right: 50, top: 1200, textAlign: "center" }}>
      {grupo.map((p, k) => {
        const actual = inicio + k === i;
        return (
          <span
            key={`${inicio + k}`}
            style={{
              fontFamily: interfaz,
              fontWeight: 800,
              fontSize: actual ? 96 : 80,
              letterSpacing: "-0.03em",
              lineHeight: 1.12,
              color: actual ? C.sobreAzul : C.hueso,
              backgroundColor: actual ? C.azul : `${C.tinta}b3`,
              padding: "2px 14px",
              margin: "0 6px 8px",
              display: "inline-block",
              transform: actual ? `scale(${entra})` : "none",
            }}
          >
            {p.texto}
          </span>
        );
      })}
    </div>
  );
};

// ------------------------------------------------------------------ recursos de reel

const PanelTelefono: React.FC<{ captura: string; dur: number }> = ({ captura, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = interpolate(f, [0, 10], [0, 1], { extrapolateRight: "clamp", easing: suave });
  const sale = interpolate(f, [dur * fps - 8, dur * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const recorrido = interpolate(f, [0, dur * fps], [18, 48], { extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        right: 70,
        top: 420,
        width: 420,
        height: 760,
        borderRadius: 60,
        border: "12px solid #1b1f27",
        overflow: "hidden",
        backgroundColor: C.tinta,
        opacity: entra * sale,
        transform: `translateY(${(1 - entra) * 120}px) rotate(${(1 - entra) * 8 + 3}deg)`,
      }}
    >
      <Img
        src={staticFile(captura)}
        style={{ width: "260%", height: "100%", objectFit: "cover", objectPosition: `${recorrido}% 30%` }}
      />
    </div>
  );
};

const Notificacion: React.FC<{ titulo: string; texto: string; tono: string; dur: number }> = ({ titulo, texto, tono, dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = interpolate(f, [0, 8], [0, 1], { extrapolateRight: "clamp", easing: suave });
  const sale = interpolate(f, [dur * fps - 8, dur * fps], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        right: 60,
        top: 360,
        display: "flex",
        alignItems: "center",
        gap: 22,
        backgroundColor: "rgba(245,247,250,0.94)",
        borderRadius: 34,
        padding: "24px 28px",
        opacity: entra * sale,
        transform: `translateY(${(1 - entra) * -80}px)`,
      }}
    >
      <div style={{ width: 70, height: 70, borderRadius: 16, backgroundColor: C.tinta, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
        <Img src={staticFile("marca/icono-dimia.svg")} style={{ width: 56 }} />
      </div>
      <div style={{ flex: 1, fontFamily: interfaz, color: "#111" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, opacity: 0.6 }}>
          <span>DIMIA</span>
          <span>ahora</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 36, fontWeight: 700 }}>
          <span style={{ width: 16, height: 16, backgroundColor: tono, display: "inline-block" }} />
          {titulo}
        </div>
        <div style={{ fontSize: 30, opacity: 0.75 }}>{texto}</div>
      </div>
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
      <div style={{ marginTop: 70, backgroundColor: C.azul, color: C.sobreAzul, fontFamily: interfaz, fontWeight: 700, fontSize: 46, padding: "30px 48px" }}>
        Agendar demostración →
      </div>
      <div style={{ marginTop: 40, fontFamily: cifras, fontSize: 32, letterSpacing: "0.24em", color: C.azul }}>dimia.mx</div>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ composición

export const Vocera: React.FC<VoceraProps> = ({ video, duracion, palabras, cortes = [], recursos = [] }) => {
  const { fps } = useVideoConfig();
  const largo = Math.round(duracion * fps);
  const s = (x: number) => Math.round(x * fps);
  const tonos = { azul: C.azul, verde: C.verde, rojo: C.rojo };
  return (
    <AbsoluteFill style={{ backgroundColor: C.tinta }}>
      <Sequence durationInFrames={largo}>
        <Encuadre video={video} cortes={cortes} />
        {recursos.map((r, i) => (
          <Sequence key={i} from={s(r.desde)} durationInFrames={s(r.hasta - r.desde)} layout="none">
            {r.tipo === "panel" ? (
              <PanelTelefono captura={r.captura} dur={r.hasta - r.desde} />
            ) : (
              <Notificacion titulo={r.titulo} texto={r.texto} tono={tonos[r.tono]} dur={r.hasta - r.desde} />
            )}
            <Audio src={staticFile("anuncio/sonido/norm/clic.wav")} volume={0.5} />
          </Sequence>
        ))}
        {cortes.slice(1).map((c, i) => (
          <Sequence key={`g${i}`} from={s(c)} durationInFrames={s(1)} layout="none">
            <Audio src={staticFile("anuncio/sonido/norm/golpe.wav")} volume={0.25} />
          </Sequence>
        ))}
        <Subtitulo palabras={palabras} />
        <Aviso />
      </Sequence>
      <Sequence from={largo} durationInFrames={s(CIERRE)}>
        <Placa />
        <Audio src={staticFile("anuncio/sonido/norm/golpe.wav")} volume={0.6} />
      </Sequence>
      <Audio src={staticFile("anuncio/sonido/norm/cama.wav")} trimBefore={s(8)} volume={0.12} />
    </AbsoluteFill>
  );
};

export const duracionVocera = (duracion: number, fps: number) => Math.round((duracion + CIERRE) * fps);
