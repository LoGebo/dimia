import React from "react";
import { Composition } from "remotion";
import { ALTO, ANCHO, FPS } from "./marca";
import { DURACION_TOTAL, Reel } from "./Reel";
import "./tipografia";

export const RemotionRoot: React.FC = () => (
  <Composition id="ReelDimia" component={Reel} durationInFrames={DURACION_TOTAL} fps={FPS} width={ANCHO} height={ALTO} />
);
