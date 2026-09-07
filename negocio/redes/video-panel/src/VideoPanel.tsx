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
  { desde: 0, duracion: 213, Escena: EscenaLlamadas },
  { desde: 207, duracion: 207, Escena: EscenaPanel },
  { desde: 408, duracion: 159, Escena: EscenaContesta },
  { desde: 561, duracion: 237, Escena: EscenaAgenda },
  { desde: 792, duracion: 228, Escena: EscenaMide },
  { desde: 1014, duracion: 267, Escena: EscenaOpera },
  { desde: 1275, duracion: 150, Escena: EscenaCierre },
] as const;

export const DURACION_TOTAL = 1425; // 47.5 s a 30 fps

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
