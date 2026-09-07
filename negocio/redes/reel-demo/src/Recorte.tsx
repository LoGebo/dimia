import React from "react";
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { ALTO, ANCHO } from "./marca";

const FUENTE_ANCHO = 1080;
const FUENTE_ALTO = 1800;

type Props = {
  /** Segundo de la grabación donde arranca el plano. */
  desde: number;
  /** Acercamiento al principio y al final del plano. 1 = la grabación llena el cuadro. */
  zoom?: number;
  zoomFin?: number;
  /** Hacia dónde mira el encuadre cuando hay acercamiento, normalizado. */
  foco?: [number, number];
  recorrido: number;
};

/**
 * Un trozo de la grabación vertical del panel.
 * La grabación ya viene en 1080 × 1800: sólo hay que llenar los 1920 de alto,
 * así que se recorta un 3 % arriba y abajo y se acerca despacio.
 */
export const Recorte: React.FC<Props> = ({ desde, zoom = 1, zoomFin, foco = [0.5, 0.5], recorrido }) => {
  const f = useCurrentFrame();
  const t = interpolate(f, [0, recorrido], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });

  const llenar = Math.max(ANCHO / FUENTE_ANCHO, ALTO / FUENTE_ALTO);
  const z = llenar * interpolate(t, [0, 1], [zoom, zoomFin ?? zoom]);
  const w = FUENTE_ANCHO * z;
  const h = FUENTE_ALTO * z;
  const izq = Math.min(0, Math.max(ANCHO - w, ANCHO / 2 - foco[0] * w));
  const arr = Math.min(0, Math.max(ALTO - h, ALTO / 2 - foco[1] * h));

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <OffthreadVideo
        src={staticFile("vertical.mp4")}
        startFrom={Math.round(desde * 30)}
        muted
        style={{ position: "absolute", left: izq, top: arr, width: w, height: h }}
      />
    </AbsoluteFill>
  );
};
