import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { cifras, interfaz, titular } from "../tipografia";

/**
 * Formatos adaptados de anuncios que la competencia sostiene en la Biblioteca de Anuncios
 * de Meta (ver negocio/redes/anuncios-pauta/README.md, sección «Ganadores»):
 * la excusa del dueño (Rosie), la carta (Podium), la escena con hora (Podium, Sara AI),
 * el llamado por giro (Podium) y la ecuación (Rosie).
 * Una idea por pieza, un titular, un botón. Sin rótulos latón.
 */

const C = {
  tinta: "#0b0f17",
  panel: "#111723",
  hueso: "#eef1f7",
  acero: "#97a2b5",
  azul: "#6e9bf5",
  sobreAzul: "#0b1220",
  rojo: "#e2685c",
  linea: "#212a3a",
} as const;

export type GanadorProps = { id: string; formato: "feed" | "story" };

type Base = { foto?: string; foco?: string; boton: string };
type Pieza =
  | (Base & { tipo: "excusa"; excusa: string; golpe: string; bajada: string })
  | (Base & { tipo: "carta"; saludo: string; parrafos: string[] })
  | (Base & { tipo: "escena"; hora: string; escena: string; aviso: string; remate: string; tono?: "rojo" | "verde" })
  | (Base & { tipo: "nicho"; llamado: string; bajada: string })
  | (Base & { tipo: "ecuacion"; izquierda: string; derecha: string; objecion: string; resaltado: string })
  | (Base & { tipo: "entrante"; titular: string; resaltado: string; estado?: string; dialogo: { quien: "cliente" | "dimia"; texto: string }[] });

export const GANADORES: Record<string, Pieza> = {
  "excusa-clinica": {
    tipo: "excusa",
    foto: "recepcion-llena-a.png",
    foco: "50% 40%",
    excusa: "«Ya volverán a llamar.»",
    golpe: "No vuelven.",
    bajada: "Agendan con el siguiente de la lista.",
    boton: "Contestar todas las llamadas",
  },
  "carta-clinicas": {
    tipo: "carta",
    saludo: "A los directores de clínicas privadas:",
    parrafos: [
      "Su teléfono suena mientras su equipo atiende a un paciente.",
      "Nadie alcanza a contestar. Ese paciente agenda con el siguiente consultorio de la lista.",
      "No es falta de ganas. Es falta de manos.",
      "Dimia contesta por ustedes, a cualquier hora, y deja la cita escrita en su agenda.",
    ],
    boton: "Agendar demostración",
  },
  "escena-cena": {
    tipo: "escena",
    foto: "cena-a.png",
    foco: "50% 60%",
    hora: "21:47",
    escena: "Usted está cenando con su familia. Alguien llama para agendar.",
    aviso: "Llamada perdida · Cliente nuevo",
    remate: "Esa llamada ya agendó con otro.",
    boton: "Que alguien conteste por usted",
  },
  "nicho-clinica": {
    tipo: "nicho",
    foto: "recepcion-llena-a.png",
    foco: "50% 45%",
    llamado: "Si usted dirige una clínica, lea esto.",
    bajada: "Cada llamada que nadie contesta es un paciente que agenda en otro lado.",
    boton: "Ver cómo se resuelve",
  },
  "ecuacion-a": {
    tipo: "ecuacion",
    foto: "recepcion-llena-a.png",
    foco: "50% 55%",
    izquierda: "Llamadas perdidas",
    derecha: "clientes perdidos",
    objecion: "Contratar a otra recepcionista",
    resaltado: "no siempre es la respuesta.",
    boton: "Conocer la otra respuesta",
  },
  "entrante-atendida": {
    tipo: "entrante",
    foto: "mano-telefono-a.png",
    titular: "Mientras usted atiende,",
    resaltado: "alguien más contesta.",
    dialogo: [
      { quien: "cliente", texto: "Quisiera agendar una limpieza." },
      { quien: "dimia", texto: "Con gusto. ¿Le queda el jueves a las 11:00?" },
      { quien: "cliente", texto: "Perfecto." },
      { quien: "dimia", texto: "Listo. Le confirmo por WhatsApp." },
    ],
    boton: "Escuchar una llamada",
  },
  "escena-auto": {
    tipo: "escena",
    foto: "auto-noche-a.png",
    foco: "40% 45%",
    hora: "22:10",
    escena: "Va de salida y revisa el teléfono.",
    aviso: "3 llamadas perdidas · números nuevos",
    remate: "Mañana ya agendaron con otro.",
    boton: "Que alguien conteste por usted",
  },
  "pregunta-auto": {
    tipo: "excusa",
    foto: "auto-noche-a.png",
    foco: "40% 45%",
    excusa: "¿Cuántas llamadas perdió hoy?",
    golpe: "Nadie lo sabe.",
    bajada: "Con Dimia cada llamada queda contestada y registrada.",
    boton: "Ver cómo funciona",
  },
  "nicho-medico": {
    tipo: "nicho",
    foto: "consulta-a.png",
    foco: "40% 55%",
    llamado: "Doctor, mientras usted consulta, su teléfono sigue sonando.",
    bajada: "Dimia contesta, agenda y confirma por WhatsApp sin interrumpir la consulta.",
    boton: "Agendar demostración",
  },
  "escena-manana": {
    tipo: "escena",
    foto: "manana-sonrisa-a.png",
    foco: "55% 40%",
    hora: "08:05",
    escena: "Llega a la oficina con su café.",
    aviso: "Dimia · 3 citas agendadas anoche",
    tono: "verde",
    remate: "Su agenda trabajó mientras usted dormía.",
    boton: "Agendar demostración",
  },
  "entrante-restaurante": {
    tipo: "entrante",
    foto: "mano-telefono-a.png",
    titular: "Mientras usted sirve,",
    estado: "Reservación · vie 21:00 · 6 personas",
    resaltado: "alguien más reserva.",
    dialogo: [
      { quien: "cliente", texto: "¿Tienen mesa para seis el viernes?" },
      { quien: "dimia", texto: "Sí. ¿A las 21:00 le funciona?" },
      { quien: "cliente", texto: "Sí, a esa hora." },
      { quien: "dimia", texto: "Reservado. Le confirmo por WhatsApp." },
    ],
    boton: "Escuchar una llamada",
  },
  "entrante-inmobiliaria": {
    tipo: "entrante",
    foto: "mano-telefono-a.png",
    titular: "Mientras usted enseña,",
    estado: "Visita agendada · sáb 10:00",
    resaltado: "alguien más agenda.",
    dialogo: [
      { quien: "cliente", texto: "¿Puedo ver el departamento de dos recámaras?" },
      { quien: "dimia", texto: "Claro. ¿El sábado a las 10:00?" },
      { quien: "cliente", texto: "Me queda bien." },
      { quien: "dimia", texto: "Visita agendada. Le mando la ubicación." },
    ],
    boton: "Escuchar una llamada",
  },
};

// ------------------------------------------------------------------ comunes

const Foto: React.FC<{ src: string; foco?: string; velo?: number }> = ({ src, foco, velo = 0 }) => (
  <AbsoluteFill>
    <Img src={staticFile(`pauta/fotos/${src}`)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: foco ?? "50% 50%" }} />
    {velo > 0 ? <AbsoluteFill style={{ backgroundColor: C.tinta, opacity: velo }} /> : null}
  </AbsoluteFill>
);

const pesado = (tam: number): React.CSSProperties => ({
  fontFamily: interfaz,
  fontWeight: 800,
  fontSize: tam,
  lineHeight: 1.02,
  letterSpacing: "-0.035em",
  color: C.hueso,
  margin: 0,
});

const Marcador: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ backgroundColor: C.azul, color: C.sobreAzul, padding: "0 0.12em", boxDecorationBreak: "clone", WebkitBoxDecorationBreak: "clone" }}>
    {children}
  </span>
);

const Boton: React.FC<{ texto: string }> = ({ texto }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 26,
      backgroundColor: C.azul,
      color: C.sobreAzul,
      fontFamily: interfaz,
      fontWeight: 700,
      fontSize: 36,
      padding: "28px 38px",
    }}
  >
    {texto}
    <span style={{ fontWeight: 800 }}>→</span>
  </div>
);

/** En story la firma sube al 80 %: el 20 % inferior lo tapa la interfaz de Instagram. */
const Firma: React.FC<{ story?: boolean }> = ({ story = false }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: story ? 384 : 0,
      height: 120,
      backgroundColor: C.tinta,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 64px",
    }}
  >
    <Img src={staticFile("marca/logotipo-dimia-tinta.svg")} style={{ width: 190 }} />
    <span style={{ fontFamily: cifras, fontSize: 24, letterSpacing: "0.18em", color: C.acero }}>dimia.mx</span>
  </div>
);

/** Distancia del pie de contenido al borde inferior: en story se respeta el 20 % que tapa la interfaz. */
const pie = (story: boolean) => (story ? 384 + 120 + 44 : 120 + 44);

// ------------------------------------------------------------------ formatos

const Excusa: React.FC<{ p: Extract<Pieza, { tipo: "excusa" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill>
    <Foto src={p.foto!} foco={p.foco} velo={0.55} />
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 320 : 110 }}>
      <h1 style={{ ...pesado(story ? 118 : 104), color: C.hueso }}>{p.excusa}</h1>
      <h1 style={{ ...pesado(story ? 150 : 132), marginTop: 26 }}>
        <Marcador>{p.golpe}</Marcador>
      </h1>
      <p style={{ fontFamily: interfaz, fontWeight: 500, fontSize: story ? 46 : 42, color: C.hueso, margin: "34px 0 0", maxWidth: 820 }}>{p.bajada}</p>
    </div>
    <div style={{ position: "absolute", left: 64, bottom: pie(story) }}>
      <Boton texto={p.boton} />
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

const Carta: React.FC<{ p: Extract<Pieza, { tipo: "carta" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill style={{ backgroundColor: C.tinta }}>
    <div style={{ position: "absolute", left: 80, right: 80, top: story ? 300 : 100 }}>
      <p style={{ fontFamily: titular, fontWeight: 400, fontStyle: "italic", fontSize: story ? 52 : 46, color: C.acero, margin: 0 }}>{p.saludo}</p>
      {p.parrafos.map((t, i) => (
        <p
          key={i}
          style={{
            fontFamily: titular,
            fontWeight: 300,
            fontSize: story ? 58 : 50,
            lineHeight: 1.28,
            color: i === p.parrafos.length - 1 ? C.azul : C.hueso,
            margin: story ? "40px 0 0" : "30px 0 0",
          }}
        >
          {t}
        </p>
      ))}
    </div>
    <div style={{ position: "absolute", left: 80, bottom: pie(story) }}>
      <Boton texto={p.boton} />
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

const Escena: React.FC<{ p: Extract<Pieza, { tipo: "escena" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill>
    <Foto src={p.foto!} foco={p.foco} velo={0.25} />
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 300 : 80 }}>
      <div style={{ fontFamily: cifras, fontVariantNumeric: "tabular-nums", fontSize: story ? 200 : 170, lineHeight: 1, color: C.hueso, letterSpacing: "-0.03em" }}>{p.hora}</div>
      <p style={{ fontFamily: interfaz, fontWeight: 600, fontSize: story ? 50 : 44, lineHeight: 1.2, color: C.hueso, margin: "20px 0 0", maxWidth: 860 }}>{p.escena}</p>
    </div>
    <div style={{ position: "absolute", left: 64, right: 64, bottom: pie(story) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, backgroundColor: C.panel, border: `1px solid ${C.linea}`, padding: "26px 30px", marginBottom: 30 }}>
        <div style={{ width: 22, height: 22, backgroundColor: p.tono === "verde" ? "#3fb68b" : C.rojo }} />
        <span style={{ fontFamily: interfaz, fontWeight: 600, fontSize: 38, color: C.hueso }}>{p.aviso}</span>
      </div>
      <h1 style={pesado(story ? 96 : 84)}>
        <Marcador>{p.remate}</Marcador>
      </h1>
      <div style={{ marginTop: 34 }}>
        <Boton texto={p.boton} />
      </div>
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

const Nicho: React.FC<{ p: Extract<Pieza, { tipo: "nicho" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill style={{ backgroundColor: C.tinta }}>
    <div style={{ position: "absolute", left: 0, right: 0, top: story ? 0 : 0, height: story ? 900 : 640, overflow: "hidden" }}>
      <Foto src={p.foto!} foco={p.foco} />
    </div>
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 950 : 680 }}>
      <h1 style={pesado(story ? 104 : 88)}>{p.llamado}</h1>
      <p style={{ fontFamily: interfaz, fontWeight: 500, fontSize: story ? 44 : 38, lineHeight: 1.3, color: C.acero, margin: "26px 0 0", maxWidth: 900 }}>{p.bajada}</p>
    </div>
    <div style={{ position: "absolute", left: 64, bottom: pie(story) }}>
      <Boton texto={p.boton} />
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

const Ecuacion: React.FC<{ p: Extract<Pieza, { tipo: "ecuacion" }>; story: boolean }> = ({ p, story }) => (
  <AbsoluteFill>
    <Foto src={p.foto!} foco={p.foco} velo={0.62} />
    <div style={{ position: "absolute", left: 64, right: 64, top: story ? 330 : 120 }}>
      <h1 style={pesado(story ? 120 : 104)}>{p.izquierda}</h1>
      <div style={{ ...pesado(story ? 170 : 150), color: C.azul, margin: "6px 0" }}>=</div>
      <h1 style={pesado(story ? 120 : 104)}>{p.derecha}</h1>
      <p style={{ fontFamily: interfaz, fontWeight: 600, fontSize: story ? 50 : 44, lineHeight: 1.25, color: C.hueso, margin: story ? "70px 0 0" : "48px 0 0", maxWidth: 900 }}>
        {p.objecion} <Marcador>{p.resaltado}</Marcador>
      </p>
    </div>
    <div style={{ position: "absolute", left: 64, bottom: pie(story) }}>
      <Boton texto={p.boton} />
    </div>
    <Firma story={story} />
  </AbsoluteFill>
);

/**
 * Pantalla del teléfono de la foto `mano-telefono-a.png` (896 × 1152) escalada a 1080 × 1350
 * con object-fit cover: la pantalla negra ocupa x 398–681, y 439–1023.
 * La llamada va dibujada encima como captura del producto. Datos de demostración.
 */
const PANTALLA = { left: 398, top: 439, width: 283, height: 584, radio: 34 };

const Entrante: React.FC<{ p: Extract<Pieza, { tipo: "entrante" }> }> = ({ p }) => (
  <AbsoluteFill>
    <Foto src={p.foto!} foco="50% 50%" />
    <div
      style={{
        position: "absolute",
        left: PANTALLA.left,
        top: PANTALLA.top,
        width: PANTALLA.width,
        height: PANTALLA.height,
        borderRadius: PANTALLA.radio,
        overflow: "hidden",
        backgroundColor: C.tinta,
        padding: "40px 16px 16px",
        boxSizing: "border-box",
        fontFamily: interfaz,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, color: C.acero, letterSpacing: "0.08em" }}>Dimia · en llamada</div>
        <div style={{ fontFamily: cifras, fontVariantNumeric: "tabular-nums", fontSize: 34, color: C.hueso, marginTop: 4 }}>00:42</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 18 }}>
        {p.dialogo.map((d, i) => (
          <div
            key={i}
            style={{
              alignSelf: d.quien === "dimia" ? "flex-end" : "flex-start",
              maxWidth: "84%",
              backgroundColor: d.quien === "dimia" ? C.azul : C.panel,
              color: d.quien === "dimia" ? C.sobreAzul : C.hueso,
              border: d.quien === "dimia" ? "none" : `1px solid ${C.linea}`,
              fontSize: 15,
              lineHeight: 1.3,
              fontWeight: d.quien === "dimia" ? 600 : 400,
              padding: "9px 11px",
            }}
          >
            {d.texto}
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, display: "flex", alignItems: "center", gap: 8, borderTop: `1px solid ${C.linea}`, paddingTop: 12 }}>
        <div style={{ width: 10, height: 10, backgroundColor: "#3fb68b" }} />
        <span style={{ fontSize: 13, color: C.hueso, fontWeight: 600 }}>{p.estado ?? "Cita agendada · jue 11:00"}</span>
      </div>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, backgroundColor: C.tinta, padding: "64px 64px 40px" }}>
      <h1 style={pesado(84)}>
        {p.titular}
        <br />
        <Marcador>{p.resaltado}</Marcador>
      </h1>
    </div>
    <div style={{ position: "absolute", left: 64, bottom: 120 + 44 }}>
      <Boton texto={p.boton} />
    </div>
    <Firma />
  </AbsoluteFill>
);

/**
 * La story monta el diseño del feed (1080 × 1350) entre los 180 y los 1530 px del lienzo
 * vertical: queda fuera del 14 % superior y del 20 % inferior que tapa la interfaz.
 */
export const Ganador: React.FC<GanadorProps> = ({ id, formato }) => {
  if (formato === "story") {
    return (
      <AbsoluteFill style={{ backgroundColor: C.tinta }}>
        <div style={{ position: "absolute", left: 0, top: 180, width: 1080, height: 1350, overflow: "hidden" }}>
          <PiezaGanador id={id} />
        </div>
      </AbsoluteFill>
    );
  }
  return <PiezaGanador id={id} />;
};

const PiezaGanador: React.FC<{ id: string }> = ({ id }) => {
  const p = GANADORES[id];
  const story = false;
  switch (p.tipo) {
    case "excusa":
      return <Excusa p={p} story={story} />;
    case "carta":
      return <Carta p={p} story={story} />;
    case "escena":
      return <Escena p={p} story={story} />;
    case "nicho":
      return <Nicho p={p} story={story} />;
    case "ecuacion":
      return <Ecuacion p={p} story={story} />;
    case "entrante":
      return <Entrante p={p} />;
  }
};
