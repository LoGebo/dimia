import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
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

/** Guion del video. Cada escena se apaga sobre la siguiente. */
export const GUION = [
  { desde: 0, duracion: 265, Escena: EscenaLlamadas },
  { desde: 258, duracion: 190, Escena: EscenaPanel },
  { desde: 440, duracion: 200, Escena: EscenaContesta },
  { desde: 632, duracion: 200, Escena: EscenaAgenda },
  { desde: 824, duracion: 205, Escena: EscenaMide },
  { desde: 1021, duracion: 165, Escena: EscenaOpera },
  { desde: 1178, duracion: 172, Escena: EscenaCierre },
] as const;

export const DURACION_TOTAL = 1350; // 45 s a 30 fps

export const VideoPanel: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: color.tinta }}>
    {GUION.map(({ desde, duracion, Escena }, i) => (
      <Sequence key={i} from={desde} durationInFrames={duracion}>
        <Escena duracion={duracion} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
