import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import {
  EscenaAgenda,
  EscenaCierre,
  EscenaContesta,
  EscenaLlamadas,
  EscenaMide,
  EscenaOpera,
  EscenaPanel,
} from "./escenas";
import { color } from "./marca";

/**
 * Guion del video. Cada escena se apaga sobre la siguiente.
 *
 * Los tiempos están calzados con la locución: cada escena abre medio segundo
 * antes de que arranque su párrafo. Si se cambia la voz, se recalculan aquí y
 * se vuelve a correr `audio.sh`.
 */
export const GUION = [
  { desde: 0, duracion: 210, Escena: EscenaLlamadas },
  { desde: 204, duracion: 165, Escena: EscenaPanel },
  { desde: 363, duracion: 201, Escena: EscenaContesta },
  { desde: 558, duracion: 162, Escena: EscenaAgenda },
  { desde: 714, duracion: 207, Escena: EscenaMide },
  { desde: 915, duracion: 180, Escena: EscenaOpera },
  { desde: 1089, duracion: 165, Escena: EscenaCierre },
] as const;

export const DURACION_TOTAL = 1254; // 41.8 s a 30 fps

export const VideoPanel: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: color.tinta }}>
    <Audio src={staticFile("audio/pista.mp3")} />
    {GUION.map(({ desde, duracion, Escena }, i) => (
      <Sequence key={i} from={desde} durationInFrames={duracion}>
        <Escena duracion={duracion} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
