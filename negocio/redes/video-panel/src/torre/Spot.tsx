import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color } from "../marca";
import { cifras } from "../tipografia";
import { EscenaCierre } from "../anuncio/Anuncio";
import { Grano, SelloHora, estado, seca } from "../anuncio/efectos";

/**
 * Spot «La torre no cierra». 18 s: 15 s de plano secuencia de Cinema Studio 4.0 y
 * 3 s de cierre de marca. Guion en negocio/redes/anuncio-plano-secuencia/README.md.
 * public/torre es un enlace a esa carpeta.
 */

export const DURACION_SPOT = 540;

/** Cambiar a "final" cuando exista la toma a 1080p. */
const TOMA = "torre/tomas/previa.mp4";
const sonido = (n: string) => `torre/sonido/norm/${n}.wav`;

const VOZ: [string, number, number][] = [
  ["voz-01", 15, 90],
  ["voz-02", 150, 235],
  ["voz-03", 315, 395],
  ["voz-04", 462, 530],
];

const volumenCama = (f: number) => (VOZ.some(([, a, b]) => f >= a - 4 && f <= b + 6) ? 0.4 : 0.8);

/** Estado compacto: la llamada en curso y luego la visita agendada. Datos de demostración. */
const EstadoLlamada: React.FC<{ agenda: number }> = ({ agenda }) => {
  const f = useCurrentFrame();
  const entra = interpolate(f, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: seca });
  const sale = interpolate(f, [112, 120], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const ok = f >= agenda;
  const seg = Math.floor(interpolate(f, [0, agenda], [0, 42], { extrapolateRight: "clamp" }));
  const late = 0.28 + 0.72 * Math.abs(Math.cos((f / 57) * Math.PI));
  return (
    <div
      style={{
        position: "absolute",
        top: 300,
        left: 70,
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "20px 26px",
        backgroundColor: `${color.tinta}d9`,
        border: `1px solid ${color.hueso}24`,
        opacity: entra * sale,
        transform: `translateY(${(1 - entra) * -14}px)`,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          backgroundColor: ok ? estado.confirmada : estado.enLlamada,
          opacity: ok ? 1 : late,
        }}
      />
      <span
        style={{
          fontFamily: cifras,
          fontSize: 30,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: color.hueso,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {ok ? "Visita agendada · Sáb 10:00" : `Dimia en llamada · 00:${String(seg).padStart(2, "0")}`}
      </span>
    </div>
  );
};

export const Spot: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: color.tinta }}>
    <Sequence from={0} durationInFrames={450}>
      <OffthreadVideo src={staticFile(TOMA)} volume={0.8} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </Sequence>

    <Sequence from={12} durationInFrames={108}>
      <SelloHora de={20 * 60 + 14} a={20 * 60 + 14.9} dur={108} texto="Llamada entrante" tono={estado.enLlamada} />
    </Sequence>
    <Sequence from={140} durationInFrames={120}>
      <EstadoLlamada agenda={70} />
    </Sequence>
    <Sequence from={300} durationInFrames={140}>
      <SelloHora de={9 * 60 + 58} a={9 * 60 + 58.9} dur={140} texto="Visita confirmada" tono={estado.confirmada} />
    </Sequence>

    <Sequence from={450} durationInFrames={90}>
      <EscenaCierre />
    </Sequence>

    <Grano fuerza={0.05} />

    <Audio src={staticFile(sonido("cama"))} volume={volumenCama} />
    {VOZ.map(([n, desde]) => (
      <Sequence key={n} from={desde}>
        <Audio src={staticFile(sonido(n))} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
