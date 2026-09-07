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
  { desde: 0, duracion: 207, Escena: EscenaLlamadas },
  { desde: 201, duracion: 201, Escena: EscenaPanel },
  { desde: 396, duracion: 201, Escena: EscenaContesta },
  { desde: 591, duracion: 165, Escena: EscenaAgenda },
  { desde: 750, duracion: 228, Escena: EscenaMide },
  { desde: 972, duracion: 228, Escena: EscenaOpera },
  { desde: 1194, duracion: 132, Escena: EscenaCierre },
] as const;

export const DURACION_TOTAL = 1326; // 44.2 s a 30 fps

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
