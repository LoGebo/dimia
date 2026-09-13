import React from "react";
import { AbsoluteFill, Audio, Img, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from "remotion";
import { cifras, interfaz } from "../tipografia";

/**
 * Video de prueba «Antes / Después», 12 s, 1080 × 1920.
 * Clona la estructura del ganador de Podium (ID 2773360503038903, 163 días activo, 3 duplicados):
 * pantalla dividida, título fijo, tres viñetas por lado y botón fijo todo el video.
 * Material ya pagado: toma de Kling del consultorio y la previa de la torre.
 * Ver negocio/redes/anuncios-pauta/README.md, «Videos ganadores».
 */

export const DURACION_ANTES_DESPUES = 360;

const C = {
  tinta: "#0b0f17",
  hueso: "#eef1f7",
  acero: "#97a2b5",
  azul: "#6e9bf5",
  sobreAzul: "#0b1220",
  rojo: "#e2685c",
  verde: "#3fb68b",
} as const;

const ANTES = ["Llamadas fuera de horario sin contestar", "Recepción saturada", "Pacientes que agendan en otro lado"];
const DESPUES = ["Cada llamada contestada, a cualquier hora", "La cita queda escrita en su agenda", "Confirmación por WhatsApp"];

const entrada = (f: number, desde: number) =>
  interpolate(f, [desde, desde + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const Columna: React.FC<{
  lado: "izq" | "der";
  etiqueta: string;
  tono: string;
  puntos: string[];
  video: React.ReactNode;
  retraso: number;
}> = ({ lado, etiqueta, tono, puntos, video, retraso }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top: 0, bottom: 0, left: lado === "izq" ? 0 : 543, width: 537, overflow: "hidden" }}>
      {video}
      <AbsoluteFill style={{ backgroundColor: C.tinta, opacity: 0.42 }} />
      <div style={{ position: "absolute", left: 36, right: 30, top: 560 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 12,
            backgroundColor: C.tinta,
            padding: "12px 18px",
            opacity: entrada(f, retraso),
          }}
        >
          <div style={{ width: 14, height: 14, backgroundColor: tono }} />
          <span style={{ fontFamily: interfaz, fontWeight: 800, fontSize: 38, color: C.hueso }}>{etiqueta}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, marginTop: 34 }}>
          {puntos.map((t, i) => {
            const o = entrada(f, retraso + 10 + i * 9);
            return (
              <div key={i} style={{ opacity: o, transform: `translateY(${(1 - o) * 14}px)` }}>
                <span
                  style={{
                    fontFamily: interfaz,
                    fontWeight: 700,
                    fontSize: 40,
                    lineHeight: 1.18,
                    color: C.hueso,
                    backgroundColor: `${C.tinta}cc`,
                    padding: "2px 8px",
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  }}
                >
                  {t}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export const AntesDespues: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: C.tinta }}>
      <Columna
        lado="izq"
        etiqueta="Antes"
        tono={C.rojo}
        puntos={ANTES}
        retraso={6}
        video={
          <Loop durationInFrames={150}>
            <OffthreadVideo
              src={staticFile("anuncio/tomas/02.mp4")}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "55% 50%" }}
            />
          </Loop>
        }
      />
      <Columna
        lado="der"
        etiqueta="Con Dimia"
        tono={C.verde}
        puntos={DESPUES}
        retraso={20}
        video={
          <Loop durationInFrames={150}>
            <OffthreadVideo
              src={staticFile("torre/tomas/previa.mp4")}
              trimBefore={300}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "38% 50%" }}
            />
          </Loop>
        }
      />

      {/* Título fijo arriba, fuera del 14 % que tapa la interfaz. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 290, display: "flex", justifyContent: "center" }}>
        <h1
          style={{
            fontFamily: interfaz,
            fontWeight: 800,
            fontSize: 68,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            color: C.hueso,
            backgroundColor: C.tinta,
            padding: "22px 34px",
            margin: 0,
            textAlign: "center",
            maxWidth: 940,
            opacity: entrada(f, 0),
          }}
        >
          Su recepción, antes y <span style={{ color: C.azul }}>después de Dimia</span>
        </h1>
      </div>

      {/* Botón fijo y firma, por encima del 20 % inferior. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 1320, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 24,
            backgroundColor: C.azul,
            color: C.sobreAzul,
            fontFamily: interfaz,
            fontWeight: 700,
            fontSize: 42,
            padding: "28px 44px",
          }}
        >
          Agendar demostración <span style={{ fontWeight: 800 }}>→</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 26, backgroundColor: C.tinta, padding: "14px 26px" }}>
          <Img src={staticFile("marca/logotipo-dimia-tinta.svg")} style={{ width: 150 }} />
          <span style={{ fontFamily: cifras, fontSize: 24, letterSpacing: "0.18em", color: C.acero }}>dimia.mx</span>
        </div>
      </div>

      <Audio src={staticFile("anuncio/sonido/norm/cama.wav")} trimBefore={200} volume={0.6} />
    </AbsoluteFill>
  );
};
