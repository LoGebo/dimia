import React from "react";
import { Composition } from "remotion";
import { ALTO, ANCHO, FPS } from "./marca";
import { DURACION_TOTAL, VideoPanel } from "./VideoPanel";
import "./tipografia";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="PanelDimia"
      component={VideoPanel}
      durationInFrames={DURACION_TOTAL}
      fps={FPS}
      width={ANCHO}
      height={ALTO}
    />
  </>
);
