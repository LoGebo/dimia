import React from "react";
import { AbsoluteFill, Easing, interpolate, staticFile, useCurrentFrame } from "remotion";
import { color } from "./marca";
import { cifras, interfaz, titular } from "./tipografia";

/** Curva única del video. Todo entra con la misma inercia. */
export const suave = Easing.bezier(0.16, 1, 0.3, 1);

export const aparecer = (f: number, desde: number, dur = 18) =>
  interpolate(f, [desde, desde + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: suave,
  });

/** Fondo tinta con retícula de cuadrados. Cero degradados de librería. */
export const Fondo: React.FC<{ deriva?: number }> = ({ deriva = 0 }) => {
  const f = useCurrentFrame();
  const y = (f * 0.12 + deriva) % 60;
  return (
    <AbsoluteFill style={{ backgroundColor: color.tinta }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            `linear-gradient(${color.hueso}0d 1px, transparent 1px),` +
            `linear-gradient(90deg, ${color.hueso}0d 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
          backgroundPosition: `0px ${y}px`,
          opacity: 0.5,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(80% 55% at 50% 38%, ${color.azul}14 0%, transparent 70%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Rótulo de sección: latón, mono, versalitas espaciadas, cuadrado al frente. */
export const Rotulo: React.FC<{ texto: string; entrada?: number }> = ({ texto, entrada = 0 }) => {
  const f = useCurrentFrame();
  const o = aparecer(f, entrada, 14);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        opacity: o,
        transform: `translateX(${interpolate(o, [0, 1], [-18, 0])}px)`,
      }}
    >
      <div style={{ width: 14, height: 14, backgroundColor: color.laton }} />
      <span
        style={{
          fontFamily: cifras,
          fontSize: 26,
          letterSpacing: "0.34em",
          textTransform: "uppercase",
          color: color.laton,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {texto}
      </span>
    </div>
  );
};

/** Titular en Newsreader 300. El remate cuadrado va al final de la frase. */
export const Titular: React.FC<{
  children: React.ReactNode;
  entrada?: number;
  tamano?: number;
  remate?: boolean;
}> = ({ children, entrada = 0, tamano = 78, remate = false }) => {
  const f = useCurrentFrame();
  const o = aparecer(f, entrada, 22);
  return (
    <h1
      style={{
        fontFamily: titular,
        fontWeight: 300,
        fontSize: tamano,
        lineHeight: 1.14,
        letterSpacing: "-0.015em",
        color: color.hueso,
        margin: 0,
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [26, 0])}px)`,
      }}
    >
      {children}
      {remate ? (
        <span
          style={{
            display: "inline-block",
            width: tamano * 0.17,
            height: tamano * 0.17,
            backgroundColor: color.azul,
            marginLeft: tamano * 0.16,
            verticalAlign: "baseline",
          }}
        />
      ) : null}
    </h1>
  );
};

export const Cuerpo: React.FC<{ children: React.ReactNode; entrada?: number }> = ({
  children,
  entrada = 0,
}) => {
  const f = useCurrentFrame();
  const o = aparecer(f, entrada, 20);
  return (
    <p
      style={{
        fontFamily: interfaz,
        fontWeight: 400,
        fontSize: 34,
        lineHeight: 1.45,
        color: `${color.hueso}b3`,
        margin: 0,
        maxWidth: 780,
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [18, 0])}px)`,
      }}
    >
      {children}
    </p>
  );
};

type Ventana = {
  fuente: string;
  /** Punto focal normalizado dentro de la captura. */
  foco: [number, number];
  /** 1 = el ancho de la captura cabe justo en la ventana. */
  zoom: number;
  focoFin?: [number, number];
  zoomFin?: number;
  ancho?: number;
  alto?: number;
  entrada?: number;
  /** Fotogramas que dura el recorrido interno. */
  recorrido?: number;
};

/**
 * Captura real del panel dentro de un marco de esquinas rectas.
 * El encuadre se mueve solo: entra en un punto y termina en otro.
 */
export const VentanaPanel: React.FC<Ventana> = ({
  fuente,
  foco,
  zoom,
  focoFin,
  zoomFin,
  ancho = 940,
  alto = 640,
  entrada = 0,
  recorrido = 200,
}) => {
  const f = useCurrentFrame();
  const o = aparecer(f, entrada, 24);
  const t = interpolate(f, [entrada, entrada + recorrido], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.quad),
  });
  const fx = interpolate(t, [0, 1], [foco[0], (focoFin ?? foco)[0]]);
  const fy = interpolate(t, [0, 1], [foco[1], (focoFin ?? foco)[1]]);
  const z = interpolate(t, [0, 1], [zoom, zoomFin ?? zoom]);

  return (
    <div
      style={{
        width: ancho,
        height: alto,
        border: `1px solid ${color.hueso}1f`,
        backgroundColor: color.tintaAlta,
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [60, 0])}px)`,
      }}
    >
      <div
        style={{
          height: 46,
          borderBottom: `1px solid ${color.hueso}14`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          paddingLeft: 20,
        }}
      >
        <div style={{ width: 10, height: 10, backgroundColor: `${color.hueso}3d` }} />
        <div style={{ width: 10, height: 10, backgroundColor: `${color.hueso}3d` }} />
        <div style={{ width: 10, height: 10, backgroundColor: color.azul }} />
        <span
          style={{
            fontFamily: cifras,
            fontSize: 15,
            letterSpacing: "0.16em",
            color: `${color.hueso}59`,
            marginLeft: 18,
          }}
        >
          panel.dimia.mx
        </span>
      </div>
      <div
        style={{
          height: alto - 47,
          backgroundImage: `url(${staticFile(fuente)})`,
          backgroundSize: `${z * 100}% auto`,
          backgroundPosition: `${fx * 100}% ${fy * 100}%`,
          backgroundRepeat: "no-repeat",
          backgroundColor: color.tinta,
        }}
      />
    </div>
  );
};

/** Cifra grande en mono con tabular-nums, como manda la marca. */
export const Cifra: React.FC<{ valor: string; pie: string; entrada?: number }> = ({
  valor,
  pie,
  entrada = 0,
}) => {
  const f = useCurrentFrame();
  const o = aparecer(f, entrada, 16);
  return (
    <div
      style={{
        opacity: o,
        transform: `translateY(${interpolate(o, [0, 1], [16, 0])}px)`,
        borderLeft: `2px solid ${color.azul}`,
        paddingLeft: 20,
      }}
    >
      <div
        style={{
          fontFamily: cifras,
          fontVariantNumeric: "tabular-nums",
          fontSize: 62,
          color: color.hueso,
          lineHeight: 1,
        }}
      >
        {valor}
      </div>
      <div
        style={{
          fontFamily: interfaz,
          fontSize: 21,
          color: `${color.hueso}8c`,
          marginTop: 12,
          letterSpacing: "0.02em",
        }}
      >
        {pie}
      </div>
    </div>
  );
};

/** Aviso permanente mientras se ven capturas. Nada de métricas sin marcar. */
export const AvisoDemo: React.FC = () => (
  <div
    style={{
      position: "absolute",
      left: 70,
      bottom: 64,
      fontFamily: cifras,
      fontSize: 17,
      letterSpacing: "0.2em",
      textTransform: "uppercase",
      color: `${color.hueso}47`,
    }}
  >
    Datos de demostración
  </div>
);
