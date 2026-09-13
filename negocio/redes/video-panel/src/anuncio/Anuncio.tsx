import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { AvisoDemo, Fondo, Titular, VentanaPanel, aparecer } from "../componentes";
import { color } from "../marca";
import { cifras, interfaz, titular } from "../tipografia";
import {
  CuadradoMascara,
  Grano,
  Reticula,
  SelloHora,
  TarjetaLlamada,
  TitularPalabras,
  Toma,
  estado,
  seca,
} from "./efectos";
import { LogotipoAnimado } from "./Logotipo";

/**
 * Reel de lanzamiento para Meta Ads. 30 s, 1080 × 1920, 30 fps.
 * Guion y reglas en negocio/redes/anuncio-lanzamiento/README.md.
 * Los medios viven allá; public/anuncio es un enlace a esa carpeta.
 */

export const DURACION_ANUNCIO = 900;

const toma = (n: string) => `anuncio/tomas/${n}.mp4`;
const sonido = (n: string) => `anuncio/sonido/norm/${n}.wav`;
const h = (hh: number, mm: number) => hh * 60 + mm;

// Fotograma de entrada de cada frase de la locución y su final aproximado.
const VOZ: [string, number, number][] = [
  ["voz-01", 6, 56],
  ["voz-02", 60, 102],
  ["voz-03", 117, 156],
  ["voz-04", 210, 304],
  ["voz-05", 345, 415],
  ["voz-06", 570, 646],
  ["voz-07", 810, 880],
];

/** La cama calla en el corte a negro y se agacha cuando alguien habla. */
const volumenCama = (f: number) => {
  if (f < 165) return 0.35;
  if (f < 186) return 0;
  const habla = VOZ.some(([, a, b]) => f >= a - 4 && f <= b + 6);
  return habla ? 0.32 : 0.7;
};

// ------------------------------------------------------------------ pantalla del teléfono

const CITAS = [
  ["09:00", "Limpieza dental"],
  ["11:30", "Corte y color"],
  ["14:00", "Mesa para 4"],
  ["18:30", "Asesoría fiscal"],
];

/** Agenda dibujada con la marca sobre la pantalla del plano 06. Datos de demostración. */
const PantallaAgenda: React.FC<{ enciende: number }> = ({ enciende }) => {
  const f = useCurrentFrame();
  const luz = interpolate(f, [enciende, enciende + 4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div
      style={{
        position: "absolute",
        left: 438,
        top: 760,
        width: 307,
        height: 676,
        borderRadius: 26, // la curva es del aparato, no de la interfaz
        overflow: "hidden",
        backgroundColor: color.tinta,
        opacity: luz,
        padding: "46px 22px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ fontFamily: cifras, fontSize: 13, letterSpacing: "0.22em", color: color.laton }}>
        HOY · JUE 4
      </div>
      <div style={{ fontFamily: titular, fontWeight: 300, fontSize: 30, color: color.hueso, marginTop: 10 }}>
        Agenda
      </div>
      {CITAS.map(([hora, que], i) => {
        const o = aparecer(f, enciende + 8 + i * 5, 10);
        return (
          <div
            key={hora}
            style={{
              borderTop: `1px solid ${color.hueso}1a`,
              padding: "16px 0",
              marginTop: i === 0 ? 22 : 0,
              opacity: o,
              transform: `translateY(${(1 - o) * 10}px)`,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: cifras, fontVariantNumeric: "tabular-nums", fontSize: 19, color: color.hueso }}>
                {hora}
              </span>
              <div style={{ width: 9, height: 9, backgroundColor: estado.confirmada }} />
            </div>
            <div style={{ fontFamily: interfaz, fontSize: 16, color: `${color.hueso}a6`, marginTop: 6 }}>{que}</div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 22,
          fontFamily: cifras,
          fontSize: 10,
          letterSpacing: "0.2em",
          color: `${color.hueso}47`,
        }}
      >
        DATOS DE DEMOSTRACIÓN
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ escenas de marca

const EscenaContesta: React.FC = () => (
  <AbsoluteFill>
    <Fondo />
    <Sequence from={0} durationInFrames={165} layout="none">
      <div style={{ position: "absolute", top: 330, left: 70, right: 70 }}>
        <TitularPalabras texto="Contesta. Entiende. Agenda." desde={6} paso={7} tamano={96} />
      </div>
      <Sequence from={22} layout="none">
        <AbsoluteFill style={{ alignItems: "center", top: 700 }}>
          <TarjetaLlamada cronometro={[6, 84]} confirma={90} />
        </AbsoluteFill>
      </Sequence>
    </Sequence>
    <Sequence from={165} durationInFrames={90} layout="none">
      <AbsoluteFill style={{ padding: "0 70px", top: 330 }}>
        <Titular tamano={80} remate>
          La cita queda escrita antes de colgar
        </Titular>
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", top: 720 }}>
        <VentanaPanel fuente="panel/agenda.png" foco={[0.3, 0.2]} zoom={1.7} focoFin={[0.45, 0.35]} zoomFin={2} recorrido={90} />
      </AbsoluteFill>
      <AvisoDemo />
    </Sequence>
  </AbsoluteFill>
);

const EscenaFrase: React.FC = () => (
  <AbsoluteFill>
    <Fondo deriva={120} />
    <div style={{ position: "absolute", top: 560, left: 70, right: 70 }}>
      <TitularPalabras texto="Contestamos lo que su negocio no alcanza a contestar." desde={6} paso={4} tamano={100} />
    </div>
  </AbsoluteFill>
);

const EscenaCierre: React.FC = () => {
  const f = useCurrentFrame();
  const linea = interpolate(f, [30, 50], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: seca });
  return (
    <AbsoluteFill>
      <Fondo deriva={300} />
      <AbsoluteFill style={{ alignItems: "center", top: 640 }}>
        <LogotipoAnimado entrada={6} ancho={720} />
        <div style={{ width: 720 * linea, height: 1, backgroundColor: `${color.hueso}2e`, margin: "56px 0 44px" }} />
        <div style={{ opacity: aparecer(f, 26, 14), textAlign: "center" }}>
          <div style={{ fontFamily: titular, fontWeight: 300, fontSize: 60, color: color.hueso }}>
            Donde el dato decide
          </div>
          <div
            style={{
              display: "inline-block",
              marginTop: 48,
              padding: "24px 40px",
              backgroundColor: color.azul,
              color: "#0b1220",
              fontFamily: interfaz,
              fontWeight: 600,
              fontSize: 34,
              opacity: aparecer(f, 40, 12),
            }}
          >
            Agendar demostración
          </div>
          <div
            style={{
              fontFamily: cifras,
              fontSize: 30,
              letterSpacing: "0.26em",
              color: color.azul,
              marginTop: 34,
              opacity: aparecer(f, 46, 12),
            }}
          >
            dimia.mx
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ línea de tiempo

export const Anuncio: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: color.tinta }}>
    {/* Gancho: la misma noche en cuatro negocios */}
    <Sequence from={0} durationInFrames={45}>
      <Toma src={toma("01")} tramos={[{ dur: 45, ritmo: 2.2 }]} golpe={0} volumen={0.35}
        empuje={{ desde: 32, hasta: 40, de: 1, a: 1.16, foco: "55% 62%" }} />
      <SelloHora de={h(20, 41)} a={h(20, 41.9)} dur={45} texto="Sin contestar" lugar="Fonda" />
    </Sequence>
    <Sequence from={45} durationInFrames={36}>
      <Toma src={toma("02")} inicio={24} tramos={[{ dur: 36, ritmo: 1.7 }]} golpe={0} volumen={0.3} />
      <SelloHora de={h(20, 52)} a={h(20, 52.9)} dur={36} texto="Sin contestar" lugar="Consultorio" />
    </Sequence>
    <Sequence from={81} durationInFrames={36}>
      <Toma src={toma("03")} inicio={6} tramos={[{ dur: 36, ritmo: 1.6 }]} golpe={0} volumen={0.3} />
      <SelloHora de={h(21, 7)} a={h(21, 7.9)} dur={36} texto="Sin contestar" lugar="Salón" />
    </Sequence>
    <Sequence from={117} durationInFrames={48}>
      <Toma src={toma("04")} tramos={[{ dur: 48, ritmo: 1 }]} golpe={0} volumen={0.5} />
      <SelloHora de={h(21, 30)} a={h(21, 30.9)} dur={48} texto="Sin contestar" lugar="Despacho" />
    </Sequence>

    {/* Negro, el cuadrado aterriza y se abre hacia el producto */}
    <Sequence from={165} durationInFrames={255}>
      <CuadradoMascara aterriza={3} abre={21}>
        <Sequence from={21} layout="none">
          <EscenaContesta />
        </Sequence>
      </CuadradoMascara>
    </Sequence>

    {/* A la mañana siguiente */}
    <Sequence from={420} durationInFrames={135}>
      <Toma src={toma("05")} tramos={[{ dur: 24, ritmo: 1 }, { dur: 20, ritmo: 2.5 }, { dur: 91, ritmo: 0.8 }]}
        golpe={44} volumen={0.7} />
      <Sequence from={30} layout="none">
        <SelloHora de={h(7, 58)} a={h(7, 58.9)} dur={105} texto="Agenda al día" tono={estado.confirmada} lugar="Fonda" />
      </Sequence>
    </Sequence>
    <Sequence from={555} durationInFrames={135}>
      <Toma src={toma("06")} tramos={[{ dur: 135, ritmo: 0.6 }]} volumen={0.3}
        empuje={{ desde: 0, hasta: 135, de: 1, a: 1.08, foco: "55% 57%" }}>
        <PantallaAgenda enciende={14} />
      </Toma>
    </Sequence>
    <Sequence from={675} durationInFrames={15}>
      <Reticula desde={0} dur={10} />
    </Sequence>

    <Sequence from={690} durationInFrames={105}>
      <EscenaFrase />
    </Sequence>
    <Sequence from={795} durationInFrames={105}>
      <EscenaCierre />
    </Sequence>

    <Grano fuerza={0.07} />

    {/* Sonido */}
    <Audio src={staticFile(sonido("cama"))} volume={volumenCama} />
    <Sequence from={0} durationInFrames={165}><Audio src={staticFile(sonido("subida"))} volume={0.7} /></Sequence>
    <Sequence from={0} durationInFrames={165}><Audio src={staticFile(sonido("vibracion"))} volume={0.8} /></Sequence>
    <Sequence from={139}><Audio src={staticFile(sonido("clic"))} /></Sequence>
    {[0, 186, 464, 801].map((g) => (
      <Sequence key={g} from={g}><Audio src={staticFile(sonido("golpe"))} volume={0.9} /></Sequence>
    ))}
    <Sequence from={210}><Audio src={staticFile(sonido("conecta"))} volume={0.6} /></Sequence>
    <Sequence from={296}><Audio src={staticFile(sonido("confirmada"))} volume={0.7} /></Sequence>
    {VOZ.map(([n, desde]) => (
      <Sequence key={n} from={desde}><Audio src={staticFile(sonido(n))} /></Sequence>
    ))}
  </AbsoluteFill>
);
