import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color } from "../marca";
import { cifras, interfaz, titular } from "../tipografia";
import { Fondo, aparecer } from "../componentes";
import { LogotipoAnimado } from "../anuncio/Logotipo";
import { Grano, SelloHora, estado, seca } from "../anuncio/efectos";

/**
 * Spot «La cita quedó escrita». 18 s: 15 s de plano de Cinema Studio 4.0 y 3 s de placa.
 * Guion en negocio/redes/anuncio-clinica-cita/README.md. public/clinica enlaza esa carpeta.
 */

export const DURACION_SPOT = 540;

const TOMA = "clinica/tomas/final-h264.mp4";
const sonido = (n: string) => `clinica/sonido/norm/${n}.wav`;

/** Locución (voz Julian, ElevenLabs vía Higgsfield) y subtítulos, en segundos de video. */
const VOZ_DESDE = 30; // 1 s, después del primer timbre
const CAMPANA_EN = 375; // 12.5 s: el primer bloque verde entra en el calendario
const SUBS_JULIAN: [number, number, string][] = [
  [0.0, 1.47, "Dimia trabaja por usted,"],
  [1.73, 3.57, "incluso cuando no está disponible."],
  [4.03, 6.68, "Su inteligencia artificial responde al instante,"],
  [6.68, 8.04, "agenda citas en segundos"],
  [8.31, 11.0, "y convierte cada oportunidad en un nuevo cliente."],
  [11.48, 12.04, "Con Dimia,"],
  [12.37, 14.11, "ninguna llamada queda sin respuesta"],
  [14.37, 15.84, "y ningún cliente se pierde."],
];

const SUBS_ANDRE: [number, number, string][] = [
  [0.0, 1.58, "Dimia trabaja por usted,"],
  [1.58, 3.83, "incluso cuando no está disponible."],
  [4.18, 7.15, "Su inteligencia artificial responde al instante,"],
  [7.15, 8.6, "agenda citas en segundos"],
  [8.6, 11.57, "y convierte cada oportunidad en un nuevo cliente."],
  [11.88, 12.53, "Con Dimia,"],
  [12.53, 14.8, "ninguna llamada queda sin respuesta"],
  [14.8, 16.56, "y ningún cliente se pierde."],
];

export type Voz = "julian" | "andre";
const SUBS: Record<Voz, [number, number, string][]> = { julian: SUBS_JULIAN, andre: SUBS_ANDRE };

const Subtitulo: React.FC<{ texto: string }> = ({ texto }) => (
  <div
    style={{
      position: "absolute",
      left: 90,
      right: 90,
      bottom: 300,
      textAlign: "center",
      fontFamily: interfaz,
      fontWeight: 500,
      fontSize: 46,
      lineHeight: 1.25,
      color: color.hueso,
    }}
  >
    {texto}
  </div>
);
/** Placa final con los archivos originales de marca: rótulo latón, titular, logotipo, pie. */
const Placa: React.FC = () => {
  const f = useCurrentFrame();
  const linea = interpolate(f, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: seca });
  return (
    <AbsoluteFill>
      <Fondo deriva={300} />
      <AbsoluteFill style={{ alignItems: "center", top: 560 }}>
        <div
          style={{
            fontFamily: cifras,
            fontSize: 26,
            letterSpacing: "0.28em",
            color: color.laton,
            opacity: aparecer(f, 4, 10),
            marginBottom: 56,
          }}
        >
          AGENTE DE VOZ DIMIA
        </div>
        <div style={{ fontFamily: titular, fontWeight: 300, fontSize: 64, lineHeight: 1.15, color: color.hueso, textAlign: "center", padding: "0 110px", opacity: aparecer(f, 14, 14) }}>
          La cita quedó escrita antes de colgar.
        </div>
        <div style={{ width: 720 * linea, height: 1, backgroundColor: `${color.hueso}2e`, margin: "64px 0 56px" }} />
        <LogotipoAnimado entrada={26} ancho={620} />
        <div style={{ fontFamily: interfaz, fontWeight: 500, fontSize: 30, color: color.hueso, marginTop: 64, opacity: aparecer(f, 46, 12) }}>
          Agendar demostración · <span style={{ color: color.azul }}>dimia.mx</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Spot: React.FC<{ voz: Voz }> = ({ voz }) => (
  <AbsoluteFill style={{ backgroundColor: color.tinta }}>
    <Sequence from={0} durationInFrames={450}>
      <OffthreadVideo src={staticFile(TOMA)} volume={(f) => (f >= VOZ_DESDE && f <= VOZ_DESDE + 475 ? 0.35 : 0.8)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </Sequence>

    <Sequence from={12} durationInFrames={110}>
      <SelloHora de={21 * 60 + 7} a={21 * 60 + 7.9} dur={110} texto="Fuera de horario · Llamada entrante" tono={estado.enLlamada} caja />
    </Sequence>
    <Sequence from={360} durationInFrames={90}>
      <SelloHora de={21 * 60 + 8} a={21 * 60 + 8.9} dur={90} texto="Cita confirmada · Mañana 18:00" tono={estado.confirmada} caja />
    </Sequence>

    <Sequence from={450} durationInFrames={90}>
      <Placa />
    </Sequence>

    <Grano fuerza={0.05} />

    <Sequence from={VOZ_DESDE}>
      <Audio src={staticFile(sonido(`voz-${voz}`))} />
    </Sequence>
    <Sequence from={CAMPANA_EN}>
      <Audio src={staticFile(sonido("campana"))} volume={0.9} />
    </Sequence>
    {SUBS[voz].map(([a, b, t]) => (
      <Sequence key={t} from={VOZ_DESDE + Math.round(a * 30)} durationInFrames={Math.round((b - a) * 30)}>
        <Subtitulo texto={t} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
