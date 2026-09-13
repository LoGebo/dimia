import React from "react";
import {
  AbsoluteFill,
  Easing,
  OffthreadVideo,
  Sequence,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { color } from "../marca";
import { cifras, interfaz, titular } from "../tipografia";

/**
 * Efectos del reel de lanzamiento. Energía sin romper el manual: cortes secos,
 * rampas de velocidad, empujes de cámara y el cuadrado como única forma.
 * Cero glow, cero partículas, cero rebotes.
 */

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Entrada seca: arranca rápido y frena en seco. */
export const seca = Easing.bezier(0.16, 1, 0.3, 1);

export const estado = {
  enLlamada: color.azul,
  confirmada: "#3fb68b",
  conflicto: "#e2685c",
} as const;

// ------------------------------------------------------------------ toma

export type Tramo = { dur: number; ritmo: number };

/**
 * Toma de video con rampas de velocidad. Cada tramo reproduce la fuente a su
 * ritmo y el siguiente arranca donde el anterior dejó la fuente.
 * `empuje` escala la imagen entre dos fotogramas (crash zoom si es corto).
 * `golpe` sacude la imagen seis fotogramas en ese fotograma.
 */
export const Toma: React.FC<{
  src: string;
  tramos: Tramo[];
  inicio?: number;
  empuje?: { desde: number; hasta: number; de: number; a: number; foco?: string };
  golpe?: number;
  volumen?: number;
  /** Capas que viajan pegadas a la imagen: siguen el empuje y la sacudida. */
  children?: React.ReactNode;
}> = ({ src, tramos, inicio = 0, empuje, golpe, volumen = 0, children }) => {
  const f = useCurrentFrame();
  const escala = empuje
    ? interpolate(f, [empuje.desde, empuje.hasta], [empuje.de, empuje.a], { ...clamp, easing: seca })
    : 1;
  const t = golpe === undefined ? 1 : Math.max(0, 1 - (f - golpe) / 6);
  const activo = golpe !== undefined && f >= golpe && f < golpe + 6;
  const dx = activo ? (random(`x${f}`) - 0.5) * 28 * t : 0;
  const dy = activo ? (random(`y${f}`) - 0.5) * 28 * t : 0;

  let salida = 0;
  let fuente = inicio;
  const partes = tramos.map(({ dur, ritmo }, i) => {
    const parte = (
      <Sequence key={i} from={salida} durationInFrames={dur} layout="none">
        <OffthreadVideo
          src={staticFile(src)}
          trimBefore={Math.round(fuente)}
          playbackRate={ritmo}
          volume={volumen}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </Sequence>
    );
    salida += dur;
    fuente += dur * ritmo;
    return parte;
  });

  return (
    <AbsoluteFill style={{ backgroundColor: color.tinta, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          transform: `translate(${dx}px, ${dy}px) scale(${escala})`,
          transformOrigin: empuje?.foco ?? "50% 45%",
        }}
      >
        {partes}
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ grano

/** Grano de película sobre toda la pieza. Cambia de semilla cada fotograma. */
export const Grano: React.FC<{ fuerza?: number }> = ({ fuerza = 0.09 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: fuerza, mixBlendMode: "overlay", pointerEvents: "none" }}>
      <svg width="100%" height="100%">
        <filter id="grano">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={f % 97} />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grano)" />
      </svg>
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ hora

const reloj = (min: number) => {
  const m = Math.floor(min) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Sello de hora con estado. Los minutos corren de `de` a `a` durante la toma.
 * Va por debajo del 14 % superior que tapa Reels.
 */
export const SelloHora: React.FC<{
  de: number;
  a: number;
  dur: number;
  texto: string;
  tono?: string;
  lugar?: string;
  /** Caja tinta detrás del sello, para fondos claros. */
  caja?: boolean;
}> = ({ de, a, dur, texto, tono = estado.conflicto, lugar, caja = false }) => {
  const f = useCurrentFrame();
  const entra = interpolate(f, [0, 5], [0, 1], { ...clamp, easing: seca });
  const min = interpolate(f, [0, dur], [de, a], clamp);
  const late = 0.28 + 0.72 * Math.abs(Math.cos((f / 57) * Math.PI));
  return (
    <div
      style={{
        position: "absolute",
        top: 300,
        left: 70,
        padding: caja ? "22px 28px 24px" : 0,
        backgroundColor: caja ? `${color.tinta}d9` : "transparent",
        border: caja ? `1px solid ${color.hueso}24` : "none",
        opacity: entra,
        transform: `translateY(${(1 - entra) * -14}px)`,
      }}
    >
      <div
        style={{
          fontFamily: cifras,
          fontVariantNumeric: "tabular-nums",
          fontSize: 132,
          lineHeight: 1,
          color: color.hueso,
          letterSpacing: "-0.02em",
        }}
      >
        {reloj(min)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
        <div style={{ width: 16, height: 16, backgroundColor: tono, opacity: late }} />
        <span
          style={{
            fontFamily: cifras,
            fontSize: 30,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: color.hueso,
          }}
        >
          {texto}
        </span>
        {lugar ? (
          <span
            style={{
              fontFamily: cifras,
              fontSize: 30,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: `${color.hueso}8c`,
            }}
          >
            · {lugar}
          </span>
        ) : null}
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ cuadrado

/**
 * El cuadrado azul aterriza al centro y luego se abre como ventana hacia la
 * escena siguiente, que va como `children`.
 */
export const CuadradoMascara: React.FC<{
  aterriza: number;
  abre: number;
  children: React.ReactNode;
}> = ({ aterriza, abre, children }) => {
  const f = useCurrentFrame();
  const caida = interpolate(f, [aterriza, aterriza + 7], [0, 1], { ...clamp, easing: Easing.in(Easing.quad) });
  const apertura = interpolate(f, [abre, abre + 11], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 0.2, 1) });
  const lado = interpolate(apertura, [0, 1], [56, 2300]);
  const recorte = `inset(calc(50% - ${lado / 2}px) calc(50% - ${lado / 2}px))`;
  return (
    <AbsoluteFill style={{ backgroundColor: color.tinta }}>
      {apertura > 0 ? (
        <AbsoluteFill style={{ clipPath: recorte }}>{children}</AbsoluteFill>
      ) : null}
      {apertura < 1 ? (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div
            style={{
              width: lado,
              height: lado,
              boxSizing: "border-box",
              border: apertura > 0 ? `3px solid ${color.azul}` : "none",
              backgroundColor: apertura > 0 ? "transparent" : color.azul,
              opacity: caida > 0 ? 1 : 0,
              transform: `translateY(${(1 - caida) * -700}px)`,
            }}
          />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ retícula

/** Retícula de cuadrados que cubre la imagen en diagonal. */
export const Reticula: React.FC<{ desde: number; dur?: number; columnas?: number }> = ({
  desde,
  dur = 12,
  columnas = 6,
}) => {
  const f = useCurrentFrame();
  const lado = 1080 / columnas;
  const filas = Math.ceil(1920 / lado);
  const celdas = [];
  for (let r = 0; r < filas; r++) {
    for (let c = 0; c < columnas; c++) {
      const orden = (r + c) / (filas + columnas - 2);
      const p = interpolate(f, [desde + orden * dur, desde + orden * dur + 4], [0, 1], clamp);
      celdas.push(
        <div
          key={`${r}-${c}`}
          style={{
            position: "absolute",
            left: c * lado,
            top: r * lado,
            width: lado + 1,
            height: lado + 1,
            backgroundColor: color.tinta,
            opacity: p,
          }}
        />,
      );
    }
  }
  return <AbsoluteFill>{celdas}</AbsoluteFill>;
};

// ------------------------------------------------------------------ titular

/** Titular en Newsreader, palabra por palabra. Remate cuadrado al final. */
export const TitularPalabras: React.FC<{
  texto: string;
  desde: number;
  paso?: number;
  tamano?: number;
}> = ({ texto, desde, paso = 4, tamano = 92 }) => {
  const f = useCurrentFrame();
  const palabras = texto.split(" ");
  const remate = interpolate(f, [desde + palabras.length * paso, desde + palabras.length * paso + 6], [0, 1], {
    ...clamp,
    easing: Easing.in(Easing.quad),
  });
  return (
    <h1
      style={{
        fontFamily: titular,
        fontWeight: 300,
        fontSize: tamano,
        lineHeight: 1.1,
        letterSpacing: "-0.015em",
        color: color.hueso,
        margin: 0,
      }}
    >
      {palabras.map((p, i) => {
        const o = interpolate(f, [desde + i * paso, desde + i * paso + 6], [0, 1], { ...clamp, easing: seca });
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              opacity: o,
              transform: `translateY(${(1 - o) * 30}px)`,
              marginRight: "0.24em",
            }}
          >
            {p}
          </span>
        );
      })}
      <span
        style={{
          display: "inline-block",
          width: tamano * 0.17,
          height: tamano * 0.17,
          backgroundColor: color.azul,
          opacity: remate > 0 ? 1 : 0,
          transform: `translateY(${(1 - remate) * -120}px)`,
        }}
      />
    </h1>
  );
};

// ------------------------------------------------------------------ estado de llamada

/**
 * Tarjeta de estado como la del sitio: la llamada entra, el cronómetro corre
 * y la cita queda confirmada. Datos de demostración.
 */
export const TarjetaLlamada: React.FC<{ confirma: number; cronometro: [number, number] }> = ({
  confirma,
  cronometro,
}) => {
  const f = useCurrentFrame();
  const entra = interpolate(f, [0, 8], [0, 1], { ...clamp, easing: seca });
  const seg = Math.floor(interpolate(f, cronometro, [0, 42], clamp));
  const late = 0.28 + 0.72 * Math.abs(Math.cos((f / 57) * Math.PI));
  const ok = interpolate(f, [confirma, confirma + 6], [0, 1], { ...clamp, easing: seca });

  const fila = (tono: string, etiqueta: string, dato: string, o: number, pulso = 1) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "30px 34px",
        borderTop: `1px solid ${color.hueso}14`,
        opacity: o,
        transform: `translateY(${(1 - o) * 22}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div style={{ width: 18, height: 18, backgroundColor: tono, opacity: pulso }} />
        <span
          style={{
            fontFamily: cifras,
            fontSize: 28,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: color.hueso,
          }}
        >
          {etiqueta}
        </span>
      </div>
      <span style={{ fontFamily: cifras, fontVariantNumeric: "tabular-nums", fontSize: 32, color: `${color.hueso}b3` }}>
        {dato}
      </span>
    </div>
  );

  return (
    <div
      style={{
        width: 940,
        backgroundColor: "#111723",
        border: `1px solid ${color.hueso}1f`,
        opacity: entra,
        transform: `translateY(${(1 - entra) * 60}px)`,
      }}
    >
      <div
        style={{
          padding: "22px 34px",
          fontFamily: cifras,
          fontSize: 20,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: `${color.hueso}59`,
        }}
      >
        panel.dimia.mx · ahora
      </div>
      {fila(estado.enLlamada, "En llamada", `00:${String(seg).padStart(2, "0")}`, 1, ok > 0 ? 1 : late)}
      {fila(estado.confirmada, "Cita confirmada", "Jue 4 · 18:30", ok)}
      <div
        style={{
          padding: "18px 34px 24px",
          fontFamily: interfaz,
          fontSize: 22,
          color: `${color.hueso}8c`,
          opacity: ok,
        }}
      >
        Aviso enviado por WhatsApp
      </div>
    </div>
  );
};
