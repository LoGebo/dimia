import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ALTO, ANCHO } from "./marca";

const FUENTE_ANCHO = 1920;
const FUENTE_ALTO = 1080;
/** Escala mínima para que la grabación apaisada llene un cuadro vertical. */
const LLENAR = ALTO / FUENTE_ALTO;

type Props = {
  /** Segundo de la grabación donde arranca el plano. */
  desde: number;
  /** Punto focal dentro de la grabación, normalizado. */
  foco: [number, number];
  focoFin?: [number, number];
  zoom?: number;
  zoomFin?: number;
  /** Fotogramas que dura el recorrido interno. */
  recorrido: number;
};

/**
 * Un trozo de la grabación, encuadrado en vertical.
 * De 16:9 a 9:16 se pierde el 70 % del ancho: el encuadre elige qué columna
 * se ve, y se mueve despacio para que el plano respire.
 */
export const Recorte: React.FC<Props> = ({ desde, foco, focoFin, zoom = 1, zoomFin, recorrido }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, recorrido], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const z = LLENAR * interpolate(t, [0, 1], [zoom, zoomFin ?? zoom]);
  const fx = interpolate(t, [0, 1], [foco[0], (focoFin ?? foco)[0]]);
  const fy = interpolate(t, [0, 1], [foco[1], (focoFin ?? foco)[1]]);

  const w = FUENTE_ANCHO * z;
  const h = FUENTE_ALTO * z;
  // El punto focal queda al centro del cuadro, sin dejar que se asome el borde.
  const izq = Math.min(0, Math.max(ANCHO - w, ANCHO / 2 - fx * w));
  const arr = Math.min(0, Math.max(ALTO - h, ALTO / 2 - fy * h));

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile("grabacion.mp4")}
        startFrom={Math.round(desde * 30)}
        muted
        style={{ position: "absolute", left: izq, top: arr, width: w, height: h }}
      />
    </AbsoluteFill>
  );
};
