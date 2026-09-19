import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color, FPS } from "../marca";
import { cifras, interfaz, titular } from "../tipografia";
import { Fondo, aparecer } from "../componentes";
import { LogotipoAnimado } from "../anuncio/Logotipo";
import { Grano, seca } from "../anuncio/efectos";

/**
 * Reel de fotos fijas (Nano Banana) con dolly digital, rótulo de estado en mono y una
 * conversación tipográfica encima. Sirve para los posts 06 y 08 de la campaña de septiembre.
 * Guiones en negocio/redes/campana-sep-19-30/post-0N/guion.md. public/campana enlaza esa carpeta.
 */

export type Turno = { quien: "CLIENTE" | "DIMIA"; texto: string };
export type Escena = {
  desde: number; // s
  hasta: number; // s
  foto: string; // ruta bajo public/
  rotulo: string; // mono, latón
  estado?: "azul" | "verde"; // cuadrado de estado junto al rótulo
  turnos?: Turno[]; // conversación acumulada visible en esta escena
  titular?: string; // Newsreader grande (solo apertura)
};
export type ReelFotosProps = {
  escenas: Escena[];
  placa: { rotulo: string; titular: string };
  demo?: boolean; // marca ESCENARIO DE DEMOSTRACIÓN
  duracion: number; // s totales incl. placa de 3 s
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const Foto: React.FC<{ src: string; dur: number }> = ({ src, dur }) => {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, dur], [1.0, 1.08], clamp); // dolly in lento
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: color.tinta }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${z})`,
          filter: "grayscale(1) contrast(1.05) brightness(.55)",
        }}
      />
      <AbsoluteFill style={{ backgroundColor: "#1f47c4", opacity: 0.16, mixBlendMode: "color" }} />
    </AbsoluteFill>
  );
};

const Rotulo: React.FC<{ texto: string; estado?: "azul" | "verde" }> = ({ texto, estado }) => {
  const f = useCurrentFrame();
  const o = aparecer(f, 4, 8);
  const tono = estado === "verde" ? "#3ddc84" : color.azul;
  return (
    <div style={{ position: "absolute", top: 300, left: 92, display: "flex", alignItems: "center", gap: 18, opacity: o }}>
      {estado && <div style={{ width: 16, height: 16, backgroundColor: tono }} />}
      <span style={{ fontFamily: cifras, fontSize: 26, letterSpacing: "0.24em", color: color.laton, fontVariantNumeric: "tabular-nums" }}>
        {texto}
      </span>
    </div>
  );
};

/** Conversación en retícula recta: rótulo mono + línea en Archivo; sin burbujas. */
const Conversacion: React.FC<{ turnos: Turno[] }> = ({ turnos }) => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 92, right: 92, top: 560, display: "flex", flexDirection: "column", gap: 34 }}>
      {turnos.map((t, i) => {
        const ultimo = i === turnos.length - 1;
        const o = ultimo ? aparecer(f, 6, 10) : 1;
        const y = ultimo ? (1 - o) * 12 : 0;
        const c = t.quien === "DIMIA" ? color.azul : color.laton;
        return (
          <div key={i} style={{ opacity: ultimo ? o : 0.55, transform: `translateY(${y}px)`, borderLeft: `2px solid ${c}`, paddingLeft: 26 }}>
            <div style={{ fontFamily: cifras, fontSize: 20, letterSpacing: "0.22em", color: c, marginBottom: 10 }}>{t.quien}</div>
            <div style={{ fontFamily: interfaz, fontWeight: 500, fontSize: 40, lineHeight: 1.25, color: color.hueso }}>{t.texto}</div>
          </div>
        );
      })}
    </div>
  );
};

const Placa: React.FC<{ rotulo: string; titular: string }> = ({ rotulo, titular: tit }) => {
  const f = useCurrentFrame();
  const linea = interpolate(f, [30, 50], [0, 1], { ...clamp, easing: seca });
  return (
    <AbsoluteFill>
      <Fondo deriva={300} />
      <AbsoluteFill style={{ alignItems: "center", top: 560 }}>
        <div style={{ fontFamily: cifras, fontSize: 26, letterSpacing: "0.28em", color: color.laton, opacity: aparecer(f, 4, 10), marginBottom: 56 }}>{rotulo}</div>
        <div style={{ fontFamily: titular, fontWeight: 300, fontSize: 64, lineHeight: 1.15, color: color.hueso, textAlign: "center", padding: "0 110px", opacity: aparecer(f, 14, 14) }}>
          {tit}
        </div>
        <div style={{ width: 720 * linea, height: 1, backgroundColor: `${color.hueso}2e`, margin: "64px 0 56px" }} />
        <LogotipoAnimado entrada={26} ancho={620} />
        <div style={{ fontFamily: interfaz, fontWeight: 500, fontSize: 30, color: color.hueso, marginTop: 64, opacity: aparecer(f, 46, 12) }}>
          Escriba DEMO · <span style={{ color: color.azul }}>dimia.mx</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const ReelFotos: React.FC<ReelFotosProps> = ({ escenas, placa, demo, duracion }) => {
  const total = Math.round(duracion * FPS);
  const placaEn = total - 3 * FPS;
  return (
    <AbsoluteFill style={{ backgroundColor: color.tinta }}>
      {escenas.map((e, i) => {
        const a = Math.round(e.desde * FPS);
        const d = Math.round((e.hasta - e.desde) * FPS);
        return (
          <Sequence key={i} from={a} durationInFrames={d}>
            <Foto src={e.foto} dur={d} />
            <Rotulo texto={e.rotulo} estado={e.estado} />
            {e.titular && (
              <div style={{ position: "absolute", left: 92, right: 92, top: 760, fontFamily: titular, fontWeight: 300, fontSize: 80, lineHeight: 1.08, color: color.hueso }}>
                {e.titular}
              </div>
            )}
            {e.turnos && <Conversacion turnos={e.turnos} />}
          </Sequence>
        );
      })}
      {demo && (
        <Sequence from={0} durationInFrames={placaEn}>
          <div style={{ position: "absolute", right: 92, bottom: 420, fontFamily: cifras, fontSize: 18, letterSpacing: "0.22em", color: `${color.hueso}88` }}>
            ESCENARIO DE DEMOSTRACIÓN
          </div>
        </Sequence>
      )}
      <Sequence from={placaEn} durationInFrames={3 * FPS}>
        <Placa {...placa} />
      </Sequence>
      <Grano fuerza={0.05} />
      <Sequence from={Math.round(escenas[escenas.length - 1].desde * FPS) + 20}>
        <Audio src={staticFile("clinica/sonido/norm/campana.wav")} volume={0.8} />
      </Sequence>
    </AbsoluteFill>
  );
};

export const REEL_06: ReelFotosProps = {
  duracion: 15,
  escenas: [
    { desde: 0, hasta: 2, foto: "campana/post-06/imagenes/toma-01.png", rotulo: "MENSAJE ENTRANTE", estado: "azul", titular: "También atiende por chat." },
    { desde: 2, hasta: 6, foto: "campana/post-06/imagenes/toma-02.png", rotulo: "ENTIENDE LA SOLICITUD", estado: "azul",
      turnos: [{ quien: "CLIENTE", texto: "¿Tiene horario mañana por la tarde?" }] },
    { desde: 6, hasta: 10, foto: "campana/post-06/imagenes/toma-03.png", rotulo: "CONSULTA REGLAS REALES", estado: "azul",
      turnos: [{ quien: "CLIENTE", texto: "¿Tiene horario mañana por la tarde?" }, { quien: "DIMIA", texto: "Hay espacio a las 18:00. ¿Desea reservarlo?" }, { quien: "CLIENTE", texto: "Sí." }] },
    { desde: 10, hasta: 12, foto: "campana/post-06/imagenes/portada-v1.png", rotulo: "CITA REGISTRADA", estado: "verde",
      turnos: [{ quien: "CLIENTE", texto: "Sí." }, { quien: "DIMIA", texto: "Su cita quedó confirmada." }] },
  ],
  placa: { rotulo: "ATENCIÓN POR CHAT", titular: "Responder es el inicio. Resolver es el resultado." },
  demo: true,
};

export const REEL_08: ReelFotosProps = {
  duracion: 16,
  escenas: [
    { desde: 0, hasta: 2, foto: "campana/post-08/imagenes/portada-v1.png", rotulo: "MENSAJE POR INSTAGRAM", estado: "azul", titular: "Un mensaje puede activar todo el proceso." },
    { desde: 2, hasta: 6, foto: "campana/post-08/imagenes/toma-01.png", rotulo: "SOLICITUD ENTENDIDA", estado: "azul",
      turnos: [{ quien: "CLIENTE", texto: "Quiero mesa para cuatro mañana a las ocho." }] },
    { desde: 6, hasta: 9, foto: "campana/post-08/imagenes/toma-01.png", rotulo: "REGLAS CONSULTADAS", estado: "azul",
      turnos: [{ quien: "CLIENTE", texto: "Quiero mesa para cuatro mañana a las ocho." }, { quien: "DIMIA", texto: "Hay mesa a las 20:00. ¿La reservo a su nombre?" }] },
    { desde: 9, hasta: 12, foto: "campana/post-08/imagenes/toma-02.png", rotulo: "AGENDA ACTUALIZADA", estado: "verde",
      turnos: [{ quien: "DIMIA", texto: "Hay mesa a las 20:00. ¿La reservo a su nombre?" }, { quien: "CLIENTE", texto: "Sí, por favor." }] },
    { desde: 12, hasta: 13, foto: "campana/post-08/imagenes/toma-02.png", rotulo: "CONFIRMACIÓN ENVIADA", estado: "verde",
      turnos: [{ quien: "DIMIA", texto: "Reserva confirmada. Le enviamos el detalle por WhatsApp." }] },
  ],
  placa: { rotulo: "ESCENARIO DE DEMOSTRACIÓN", titular: "Proceso completo." },
  demo: true,
};
