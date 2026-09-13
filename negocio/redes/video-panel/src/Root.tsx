import React from "react";
import { Composition, Still } from "remotion";
import { ALTO, ANCHO, FPS } from "./marca";
import { DURACION_TOTAL, VideoPanel } from "./VideoPanel";
import { Anuncio, DURACION_ANUNCIO } from "./anuncio/Anuncio";
import { DURACION_SPOT, Spot } from "./torre/Spot";
import { Post } from "./posts/Post";
import { Anuncio as AnuncioPauta } from "./anuncios/Anuncio";
import { Ganador } from "./anuncios/Ganadores";
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
    <Composition
      id="AnuncioLanzamiento"
      component={Anuncio}
      durationInFrames={DURACION_ANUNCIO}
      fps={FPS}
      width={ANCHO}
      height={ALTO}
    />
    <Still id="GanadorFeed" component={Ganador} width={1080} height={1350} defaultProps={{ id: "excusa-clinica", formato: "feed" as const }} />
    <Still id="GanadorStory" component={Ganador} width={1080} height={1920} defaultProps={{ id: "excusa-clinica", formato: "story" as const }} />
    <Still id="AnuncioFeed" component={AnuncioPauta} width={1080} height={1350} defaultProps={{ id: "llame-a", formato: "feed" as const }} />
    <Still id="AnuncioStory" component={AnuncioPauta} width={1080} height={1920} defaultProps={{ id: "llame-a", formato: "story" as const }} />
    <Still id="PostFeed" component={Post} width={1080} height={1350} defaultProps={{ n: "01", formato: "feed" as const }} />
    <Still id="PostStory" component={Post} width={1080} height={1920} defaultProps={{ n: "01", formato: "story" as const }} />
    <Composition
      id="SpotTorre"
      component={Spot}
      durationInFrames={DURACION_SPOT}
      fps={FPS}
      width={ANCHO}
      height={ALTO}
    />
  </>
);
