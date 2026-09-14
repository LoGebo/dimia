import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { cifras, interfaz } from "../tipografia";

/**
 * Carrusel 1:1 que replica el de Rosie (ID 1328177095451777, activo desde el 23 jun 2026,
 * 82 días y 2 duplicados al 13 sep): «Missed Calls = Missed Customers» y
 * «Hiring More Isn't Always the Answer». La tercera tarjeta es el cierre de Dimia.
 *
 * Versión 2: la estructura se queda, los componentes dejan de ser genéricos.
 * - Notificaciones con foto real de cada cliente, vidrio esmerilado del sistema operativo,
 *   ícono de teléfono colgado dibujado a mano, perspectiva y desenfoque por profundidad.
 * - Tarjeta 2 con fotografía de figuras en 3D, no siluetas de bloques.
 * - Tarjeta 3 con la mano y el teléfono de verdad.
 * Fotos generadas en Nano Banana ilimitado: anuncios-pauta/fotos/.
 */

export type CarruselProps = { tarjeta: 1 | 2 | 3 };

const C = {
  papel: "#f2f4f8",
  tinta: "#0b0f17",
  tinta2: "#5a6478",
  hondo: "#1f47c4",
  rojo: "#e5484d",
  verde: "#30a46c",
} as const;

const titulo: React.CSSProperties = {
  fontFamily: interfaz,
  fontWeight: 800,
  fontSize: 96,
  lineHeight: 1.0,
  letterSpacing: "-0.04em",
  color: C.tinta,
  margin: 0,
};

/** Fondo papel con una luz muy suave arriba: da volumen sin degradado de marca. */
const Fondo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: C.papel, overflow: "hidden" }}>
    <AbsoluteFill style={{ background: "radial-gradient(70% 45% at 30% 0%, #ffffff 0%, rgba(255,255,255,0) 70%)" }} />
    {children}
  </AbsoluteFill>
);

// ------------------------------------------------------------------ ícono de llamada

/** Auricular dibujado como trazo propio, sin librería de íconos. */
const Auricular: React.FC<{ color?: string; colgado?: boolean; tam?: number }> = ({ color = "#fff", colgado = true, tam = 34 }) => (
  <svg width={tam} height={tam} viewBox="0 0 24 24" style={{ transform: colgado ? "rotate(135deg)" : "none" }}>
    <path
      d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"
      fill={color}
    />
  </svg>
);

// ------------------------------------------------------------------ notificación

type Aviso = {
  x: number;
  y: number;
  giroZ: number;
  giroY: number;
  escala: number;
  foto: number;
  nombre: string;
  detalle: string;
  profundidad: 0 | 1 | 2;
};

/** Retrato recortado de la hoja generada (anuncios-pauta/fotos/retrato-N.png). */
const Retrato: React.FC<{ i: number; tam: number }> = ({ i, tam }) => (
  <div style={{ width: tam, height: tam, borderRadius: "50%", overflow: "hidden", flex: "none", backgroundColor: "#dfe3ea" }}>
    <Img src={staticFile(`pauta/fotos/retrato-${i}.png`)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  </div>
);

const Notificacion: React.FC<{ a: Aviso; estado: "perdida" | "agendada" }> = ({ a, estado }) => {
  const blur = [0, 1.2, 4][a.profundidad];
  const opacidad = [1, 0.9, 0.55][a.profundidad];
  return (
    <div
      style={{
        position: "absolute",
        left: a.x,
        top: a.y,
        width: 700,
        height: 150,
        transform: `perspective(1400px) rotateY(${a.giroY}deg) rotateZ(${a.giroZ}deg) scale(${a.escala})`,
        transformOrigin: "left center",
        borderRadius: 75,
        background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(236,239,246,0.82))",
        border: "1.5px solid rgba(255,255,255,0.9)",
        outline: "1px solid rgba(15,23,42,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 26,
        padding: "0 22px 0 18px",
        boxSizing: "border-box",
        filter: blur ? `blur(${blur}px)` : "none",
        opacity: opacidad,
      }}
    >
      <Retrato i={a.foto} tam={112} />
      <div style={{ flex: 1, fontFamily: interfaz, lineHeight: 1.15, overflow: "hidden" }}>
        <div style={{ fontSize: 40, fontWeight: 700, color: C.tinta, whiteSpace: "nowrap" }}>{a.nombre}</div>
        <div style={{ fontSize: 30, color: estado === "perdida" ? C.rojo : C.verde, fontWeight: 600, whiteSpace: "nowrap" }}>{a.detalle}</div>
      </div>
      <div
        style={{
          width: 104,
          height: 104,
          borderRadius: "50%",
          flex: "none",
          backgroundColor: estado === "perdida" ? C.rojo : C.verde,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Auricular colgado={estado === "perdida"} tam={50} />
      </div>
    </div>
  );
};

const CASCADA: Aviso[] = [
  // fondo: chicas y desenfocadas, repartidas en los bordes
  { x: 560, y: 300, giroZ: -7, giroY: -16, escala: 0.56, foto: 4, nombre: "Paciente nuevo", detalle: "Llamada perdida · 20:41", profundidad: 2 },
  { x: -150, y: 340, giroZ: 9, giroY: 16, escala: 0.6, foto: 5, nombre: "Cliente nuevo", detalle: "Llamada perdida · 20:58", profundidad: 2 },
  { x: 640, y: 690, giroZ: -11, giroY: -14, escala: 0.58, foto: 2, nombre: "Cliente nuevo", detalle: "Llamada perdida · 23:15", profundidad: 2 },
  { x: -170, y: 980, giroZ: 6, giroY: 12, escala: 0.6, foto: 1, nombre: "Paciente nuevo", detalle: "Llamada perdida · 23:40", profundidad: 2 },
  { x: 560, y: 1010, giroZ: -5, giroY: -10, escala: 0.56, foto: 3, nombre: "Cliente nuevo", detalle: "Llamada perdida · 21:10", profundidad: 2 },
  // media: casi nítidas, sin tapar el texto de la principal
  { x: 330, y: 420, giroZ: 8, giroY: -12, escala: 0.8, foto: 3, nombre: "Cliente nuevo", detalle: "Llamada perdida · 21:47", profundidad: 1 },
  { x: -40, y: 850, giroZ: -7, giroY: 14, escala: 0.78, foto: 2, nombre: "Paciente nuevo", detalle: "Llamada perdida · 22:30", profundidad: 1 },
  { x: 420, y: 800, giroZ: 10, giroY: -8, escala: 0.74, foto: 5, nombre: "Cliente nuevo", detalle: "Llamada perdida · 22:48", profundidad: 1 },
  // frente
  { x: 60, y: 600, giroZ: -8, giroY: 8, escala: 1.02, foto: 0, nombre: "Paciente nuevo", detalle: "Llamada perdida · 22:05", profundidad: 0 },
];

// ------------------------------------------------------------------ tarjetas

const Tarjeta1: React.FC = () => (
  <Fondo>
    <div style={{ position: "absolute", left: 80, top: 90 }}>
      <h1 style={titulo}>Llamadas perdidas =</h1>
      <h1 style={{ ...titulo, color: C.hondo }}>clientes perdidos</h1>
    </div>
    {[2, 1, 0].flatMap((p) =>
      CASCADA.filter((a) => a.profundidad === p).map((a, i) => <Notificacion key={`${p}-${i}`} a={a} estado="perdida" />),
    )}
  </Fondo>
);

const Tarjeta2: React.FC = () => (
  <Fondo>
    <div style={{ position: "absolute", left: 80, top: 80, right: 40 }}>
      <h1 style={{ ...titulo, fontSize: 80 }}>Contratar más personal</h1>
      <h1 style={{ ...titulo, fontSize: 80, marginTop: 10 }}>
        <span style={{ backgroundColor: C.hondo, color: "#fff", padding: "0 14px" }}>no siempre</span> es la respuesta
      </h1>
    </div>
    <div style={{ position: "absolute", left: 60, right: 60, top: 350, bottom: 60, overflow: "hidden" }}>
      <Img
        src={staticFile("pauta/fotos/figuras.png")}
        style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 90%", transform: "scale(1.75)", transformOrigin: "50% 86%" }}
      />
    </div>
  </Fondo>
);

const Tarjeta3: React.FC = () => (
  <Fondo>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
      <Img src={staticFile("pauta/fotos/mano-telefono-a.png")} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 45%" }} />
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, backgroundColor: C.papel, padding: "80px 80px 40px" }}>
      <h1 style={titulo}>Dimia contesta</h1>
      <h1 style={{ ...titulo, color: C.hondo }}>cada llamada.</h1>
    </div>
    {/* Pantalla del teléfono de la foto (896 × 1152 escalada a 1080 con cover y foco 45 %): y 319–903. */}
    <div
      style={{
        position: "absolute",
        left: 398,
        top: 319,
        width: 283,
        height: 584,
        borderRadius: 34,
        overflow: "hidden",
        backgroundColor: "#0b0f17",
        padding: "54px 12px 12px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ fontFamily: interfaz, fontWeight: 600, fontSize: 64, color: "#fff", textAlign: "center", lineHeight: 1 }}>09:05</div>
      <div style={{ fontFamily: interfaz, fontSize: 15, color: "#97a2b5", textAlign: "center", marginBottom: 10 }}>jueves 11 de septiembre</div>
      {[
        { f: 0, t: "Cita agendada", d: "Jue 11:00 · Limpieza" },
        { f: 3, t: "Cita agendada", d: "Jue 12:30 · Consulta" },
        { f: 1, t: "Visita agendada", d: "Sáb 10:00 · Showroom" },
      ].map((n, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, backgroundColor: "rgba(245,247,250,0.9)", borderRadius: 18, padding: "10px 10px" }}>
          <Retrato i={n.f} tam={40} />
          <div style={{ flex: 1, fontFamily: interfaz, lineHeight: 1.15 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{n.t}</div>
            <div style={{ fontSize: 13, color: C.verde, fontWeight: 600 }}>{n.d}</div>
          </div>
        </div>
      ))}
    </div>
    <div style={{ position: "absolute", left: 60, right: 60, bottom: 50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ backgroundColor: C.hondo, color: "#fff", fontFamily: interfaz, fontWeight: 700, fontSize: 36, padding: "24px 34px" }}>Agendar demostración →</div>
      <div style={{ backgroundColor: C.papel, padding: "16px 20px" }}>
        <Img src={staticFile("marca/logotipo-dimia-papel.svg")} style={{ width: 170, display: "block" }} />
      </div>
    </div>
    <span style={{ display: "none", fontFamily: cifras }} />
  </Fondo>
);

export const Carrusel: React.FC<CarruselProps> = ({ tarjeta }) =>
  tarjeta === 1 ? <Tarjeta1 /> : tarjeta === 2 ? <Tarjeta2 /> : <Tarjeta3 />;
