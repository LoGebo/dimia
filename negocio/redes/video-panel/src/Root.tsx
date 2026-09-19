import React from "react";
import { Composition, Still } from "remotion";
import { ALTO, ANCHO, FPS } from "./marca";
import { DURACION_TOTAL, VideoPanel } from "./VideoPanel";
import { Anuncio, DURACION_ANUNCIO } from "./anuncio/Anuncio";
import { DURACION_SPOT, Spot } from "./torre/Spot";
import { DURACION_SPOT as DURACION_CLINICA, Spot as SpotClinica, type Voz } from "./clinica/Spot";
import { Post } from "./posts/Post";
import { Anuncio as AnuncioPauta } from "./anuncios/Anuncio";
import { Ganador } from "./anuncios/Ganadores";
import { Carrusel } from "./anuncios/Carrusel";
import { Buzon } from "./anuncios/Buzon";
import { Vocera, duracionVocera, type VoceraProps } from "./anuncios/Vocera";
import { AntesDespues, DURACION_ANTES_DESPUES } from "./anuncios/AntesDespues";
import { ReelFotos, REEL_06, REEL_08 } from "./campana/ReelFotos";
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
    <Composition id="AntesDespues" component={AntesDespues} durationInFrames={DURACION_ANTES_DESPUES} fps={FPS} width={ANCHO} height={ALTO} />
    <Composition
      id="VoceraValentina"
      component={Vocera}
      fps={FPS}
      width={ANCHO}
      height={ALTO}
      durationInFrames={duracionVocera(30, FPS)}
      defaultProps={{ video: "pauta/videos/marco15.mp4", duracion: 15, palabras: [] } as VoceraProps}
      calculateMetadata={({ props }) => ({ durationInFrames: duracionVocera(props.duracion, FPS) })}
    />
    <Still id="BuzonMurio" component={Buzon} width={1080} height={1350} />
    <Still id="CarruselLlamadas" component={Carrusel} width={1080} height={1080} defaultProps={{ tarjeta: 1 as const }} />
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
    <Composition id="SpotClinica" component={SpotClinica} durationInFrames={DURACION_CLINICA} fps={FPS} width={ANCHO} height={ALTO} defaultProps={{ voz: "julian" as Voz }} />
    <Composition id="Reel06" component={ReelFotos} durationInFrames={REEL_06.duracion * FPS} fps={FPS} width={ANCHO} height={ALTO} defaultProps={REEL_06} />
    <Composition id="Reel08" component={ReelFotos} durationInFrames={REEL_08.duracion * FPS} fps={FPS} width={ANCHO} height={ALTO} defaultProps={REEL_08} />
  </>
);
