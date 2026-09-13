import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { cifras, interfaz } from "../tipografia";

/**
 * Anuncios estáticos para pauta en Meta. A diferencia de los posts de marca, aquí se
 * clonan formatos que la competencia corre hoy en la Biblioteca de Anuncios:
 * «llámele usted», titular con lista y botón, la cuenta de horas, la pantalla bloqueada
 * con llamadas perdidas y la pregunta que detiene el scroll.
 * Sin rótulos latón: se ven a plantilla. Titulares en Archivo 800, grandes.
 * Fuente: negocio/redes/anuncios-pauta/README.md
 */

const C = {
  tinta: "#0b0f17",
  panel: "#111723",
  hueso: "#eef1f7",
  acero: "#97a2b5",
  azul: "#6e9bf5",
  sobreAzul: "#0b1220",
  verde: "#3fb68b",
  rojo: "#e2685c",
} as const;

export type AnuncioProps = { id: string; formato: "feed" | "story" };

type Base = { foto: string; foco?: string };
type Pieza =
  | (Base & { tipo: "llame"; titular: string; numero: string; bajada: string; boton: string })
  | (Base & { tipo: "horas"; boton: string })
  | (Base & { tipo: "bloqueo"; hora: string; avisos: { app: string; titulo: string; texto: string; tono: "rojo" | "verde" }[]; remate: string; boton: string })
  | (Base & { tipo: "lista"; titular: string; resaltado: string; puntos: string[]; boton: string })
  | (Base & { tipo: "pregunta"; pregunta: string; respuesta: string; boton: string });

export const ANUNCIOS: Record<string, Pieza> = {
  "llame-a": {
    tipo: "llame",
    foto: "01.png",
    foco: "50% 70%",
    titular: "No nos crea. Llame usted.",
    numero: "[ número por confirmar ]",
    bajada: "Le contesta el mismo agente que atendería a sus clientes.",
    boton: "Llamar ahora",
  },
  "horas-a": { tipo: "horas", foto: "02.png", foco: "50% 60%", boton: "Cubrir las 123 horas" },
  "bloqueo-perdidas": {
    tipo: "bloqueo",
    foto: "05.png",
    hora: "20:14",
    avisos: [
      { app: "Teléfono", titulo: "Llamada perdida", texto: "+52 55 •••• 2841", tono: "rojo" },
      { app: "Teléfono", titulo: "Llamada perdida", texto: "+52 81 •••• 0937", tono: "rojo" },
      { app: "Teléfono", titulo: "Llamada perdida", texto: "+52 33 •••• 5512", tono: "rojo" },
    ],
    remate: "Cada una era un cliente.",
    boton: "Que nadie se quede sin respuesta",
  },
  "bloqueo-dimia": {
    tipo: "bloqueo",
    foto: "05.png",
    hora: "20:14",
    avisos: [
      { app: "Dimia", titulo: "Cita agendada", texto: "Jueves 18:30 · Primera consulta", tono: "verde" },
      { app: "Dimia", titulo: "Visita agendada", texto: "Sábado 10:00 · Showroom", tono: "verde" },
      { app: "Dimia", titulo: "Reservación confirmada", texto: "Viernes 21:00 · Mesa para 6", tono: "verde" },
    ],
    remate: "Mismo horario. Otro final.",
    boton: "Agendar demostración",
  },
  "lista-a": {
    tipo: "lista",
    foto: "06.png",
    foco: "50% 40%",
    titular: "Su recepción cierra.",
    resaltado: "Su teléfono, no.",
    puntos: ["Contesta al primer timbre", "Agenda en su calendario", "Confirma por WhatsApp"],
    boton: "Agendar demostración",
  },
  "pregunta-a": {
    tipo: "pregunta",
    foto: "02.png",
    foco: "50% 30%",
    pregunta: "¿Quién contesta su teléfono a las 11 de la noche?",
    respuesta: "Nosotros.",
    boton: "Ver cómo funciona",
  },
};

// ------------------------------------------------------------------ piezas comunes

const Foto: React.FC<{ src: string; foco?: string; oscurecer?: number }> = ({ src, foco, oscurecer = 0 }) => (
  <AbsoluteFill>
    <Img src={staticFile(`posts/fotos/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: foco ?? "50% 50%" }} />
    {oscurecer > 0 ? <AbsoluteFill style={{ backgroundColor: C.tinta, opacity: oscurecer }} /> : null}
  </AbsoluteFill>
);

const Boton: React.FC<{ texto: string; ancho?: boolean }> = ({ texto, ancho }) => (
  <div
    style={{
      display: ancho ? "flex" : "inline-flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 28,
      backgroundColor: C.azul,
      color: C.sobreAzul,
      fontFamily: interfaz,
      fontWeight: 700,
      fontSize: 38,
      padding: "30px 40px",
    }}
  >
    {texto}
    <span style={{ fontWeight: 800 }}>→</span>
  </div>
);

/** Franja inferior sólida: el logotipo nunca va encimado sobre foto sin caja. */
const Firma: React.FC<{ alto?: number; story?: boolean }> = ({ alto = 128, story = false }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: story ? 384 : 0,
      height: alto,
      backgroundColor: C.tinta,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 64px",
    }}
  >
    <Img src={staticFile("marca/logotipo-dimia-tinta.svg")} style={{ width: 200 }} />
    <span style={{ fontFamily: cifras, fontSize: 26, letterSpacing: "0.18em", color: C.acero }}>dimia.mx</span>
  </div>
);

const grande = (tam: number): React.CSSProperties => ({
  fontFamily: interfaz,
  fontWeight: 800,
  fontSize: tam,
  lineHeight: 1.02,
  letterSpacing: "-0.035em",
  color: C.hueso,
  margin: 0,
});

/** Palabra resaltada con barra azul detrás, como marcador. */
const Marca: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ backgroundColor: C.azul, color: C.sobreAzul, padding: "0 0.14em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
    {children}
  </span>
);

// ------------------------------------------------------------------ formatos

const Llame: React.FC<{ p: Extract<Pieza, { tipo: "llame" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill>
    <Foto src={p.foto} foco={p.foco} oscurecer={0.35} />
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 300 : 90 }}>
      <h1 style={grande(story ? 120 : 104)}>{p.titular}</h1>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: story ? 384 + 128 + 40 : 128, backgroundColor: C.tinta, padding: "48px 64px 56px" }}>
      <div style={{ fontFamily: cifras, fontVariantNumeric: "tabular-nums", fontSize: story ? 64 : 58, color: C.azul, letterSpacing: "0.02em" }}>{p.numero}</div>
      <p style={{ fontFamily: interfaz, fontSize: 36, lineHeight: 1.35, color: C.hueso, margin: "22px 0 36px", maxWidth: 860 }}>{p.bajada}</p>
      <Boton texto={p.boton} ancho />
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

const Horas: React.FC<{ p: Extract<Pieza, { tipo: "horas" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill style={{ backgroundColor: C.tinta }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: story ? 760 : 520, overflow: "hidden" }}>
      <Foto src={p.foto} foco={p.foco} oscurecer={0.15} />
    </div>
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 820 : 570 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28 }}>
        <span style={{ ...grande(story ? 170 : 150), color: C.acero }}>45 h</span>
        <span style={{ fontFamily: interfaz, fontSize: 34, color: C.acero, lineHeight: 1.25 }}>
          atiende su recepción
          <br />
          de 9 a 6, lunes a viernes
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 8 }}>
        <span style={grande(story ? 170 : 150)}>
          <Marca>168 h</Marca>
        </span>
        <span style={{ fontFamily: interfaz, fontSize: 34, color: C.hueso, lineHeight: 1.25 }}>
          tiene la semana
          <br />
          para que sus clientes llamen
        </span>
      </div>
      <div style={{ marginTop: story ? 70 : 44 }}>
        <Boton texto={p.boton} />
      </div>
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

const Bloqueo: React.FC<{ p: Extract<Pieza, { tipo: "bloqueo" }>; story: boolean }> = ({ p, story }) => {
  // Maqueta de pantalla bloqueada. Las esquinas redondeadas son del sistema operativo que
  // se retrata, no de la marca: fuera de la maqueta todo sigue recto.
  const w = story ? 700 : 600;
  const h = story ? 1240 : 900;
  return (
    <AbsoluteFill style={{ backgroundColor: C.tinta }}>
      <div
        style={{
          position: "absolute",
          left: (1080 - w) / 2,
          top: story ? 250 : 64,
          width: w,
          height: h,
          borderRadius: 72,
          overflow: "hidden",
          border: "14px solid #1b1f27",
        }}
      >
        <Foto src={p.foto} oscurecer={0.45} />
        <div style={{ position: "absolute", left: 0, right: 0, top: story ? 96 : 60, textAlign: "center", color: "#fff" }}>
          <div style={{ fontFamily: interfaz, fontSize: 30, fontWeight: 500, opacity: 0.9 }}>jueves 11 de septiembre</div>
          <div style={{ fontFamily: interfaz, fontWeight: 600, fontSize: story ? 190 : 160, lineHeight: 1, letterSpacing: "-0.03em" }}>{p.hora}</div>
        </div>
        <div style={{ position: "absolute", left: 24, right: 24, top: story ? 460 : 340, display: "flex", flexDirection: "column", gap: 14 }}>
          {p.avisos.map((a, i) => (
            <div key={i} style={{ backgroundColor: "rgba(245,247,250,0.86)", borderRadius: 30, padding: "20px 24px", display: "flex", gap: 18, alignItems: "center" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  flex: "none",
                  backgroundColor: a.tono === "rojo" ? "#34c759" : C.tinta,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {a.app === "Dimia" ? <Img src={staticFile("marca/icono-dimia.svg")} style={{ width: 44 }} /> : null}
              </div>
              <div style={{ flex: 1, fontFamily: interfaz, color: "#111" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 22, opacity: 0.6 }}>
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{a.app}</span>
                  <span>ahora</span>
                </div>
                <div style={{ fontSize: 30, fontWeight: 700, color: a.tono === "rojo" ? "#d93025" : "#111" }}>{a.titulo}</div>
                <div style={{ fontSize: 26, opacity: 0.75 }}>{a.texto}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: "absolute", left: 64, right: 64, bottom: story ? 384 + 128 + 40 : 128 + 34, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
        <h1 style={{ ...grande(story ? 88 : 64), maxWidth: 560 }}>{p.remate}</h1>
      </div>
      <Firma story={story} />
    </AbsoluteFill>
  );
};

const Lista: React.FC<{ p: Extract<Pieza, { tipo: "lista" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill style={{ backgroundColor: C.tinta }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: story ? 700 : 470, overflow: "hidden" }}>
      <Foto src={p.foto} foco={p.foco} />
    </div>
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 760 : 510 }}>
      <h1 style={grande(story ? 112 : 96)}>
        {p.titular}
        <br />
        <Marca>{p.resaltado}</Marca>
      </h1>
      <div style={{ marginTop: story ? 56 : 36, display: "flex", flexDirection: "column", gap: story ? 22 : 14 }}>
        {p.puntos.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 26, borderTop: `1px solid #212a3a`, paddingTop: story ? 22 : 14 }}>
            <span style={{ fontFamily: cifras, fontSize: 30, color: C.azul, fontVariantNumeric: "tabular-nums" }}>0{i + 1}</span>
            <span style={{ fontFamily: interfaz, fontWeight: 600, fontSize: story ? 46 : 40, color: C.hueso }}>{t}</span>
          </div>
        ))}
      </div>
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

const Pregunta: React.FC<{ p: Extract<Pieza, { tipo: "pregunta" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill>
    <Foto src={p.foto} foco={p.foco} oscurecer={0.5} />
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 300 : 110 }}>
      <h1 style={grande(story ? 130 : 112)}>{p.pregunta}</h1>
      <div style={{ ...grande(story ? 130 : 112), marginTop: 30 }}>
        <Marca>{p.respuesta}</Marca>
      </div>
    </div>
    <div style={{ position: "absolute", left: 64, bottom: story ? 384 + 128 + 48 : 128 + 48 }}>
      <Boton texto={p.boton} />
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

/**
 * La story monta el diseño del feed (1080 × 1350) entre los 180 y los 1530 px del lienzo
 * vertical: queda fuera del 14 % superior y del 20 % inferior que tapa la interfaz.
 */
export const Anuncio: React.FC<AnuncioProps> = ({ id, formato }) => {
  if (formato === "story") {
    return (
      <AbsoluteFill style={{ backgroundColor: C.tinta }}>
        <div style={{ position: "absolute", left: 0, top: 180, width: 1080, height: 1350, overflow: "hidden" }}>
          <PiezaAnuncio id={id} />
        </div>
      </AbsoluteFill>
    );
  }
  return <PiezaAnuncio id={id} />;
};

const PiezaAnuncio: React.FC<{ id: string }> = ({ id }) => {
  const p = ANUNCIOS[id];
  const story = false;
  switch (p.tipo) {
    case "llame":
      return <Llame p={p} story={story} />;
    case "horas":
      return <Horas p={p} story={story} />;
    case "bloqueo":
      return <Bloqueo p={p} story={story} />;
    case "lista":
      return <Lista p={p} story={story} />;
    case "pregunta":
      return <Pregunta p={p} story={story} />;
  }
};
