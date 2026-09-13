import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { cifras, interfaz, titular } from "../tipografia";

/**
 * Posts de lanzamiento para Instagram y Facebook. Fotografía arriba, bloque sólido de
 * marca abajo: el logotipo nunca va encimado sobre la foto sin caja.
 * Serie y reglas en negocio/redes/posts-lanzamiento/README.md.
 */

type Plantilla = "tinta" | "papel" | "hondo";

export type PostProps = {
  n: string;
  formato: "feed" | "story";
};

type Pieza = {
  foto: string;
  rotulo: string;
  titular: string;
  cifra?: string;
  plantilla: Plantilla;
  /** object-position de la foto. */
  foco?: string;
};

export const POSTS: Record<string, Pieza> = {
  "01": {
    foto: "01.png",
    rotulo: "Fuera de horario",
    titular: "Su teléfono sonó a las 20:14. Nadie contestó.",
    plantilla: "tinta",
    foco: "50% 90%",
  },
  "02": {
    foto: "02.png",
    rotulo: "Atención continua",
    cifra: "24/7",
    titular: "Contesta cuando su equipo ya se fue.",
    plantilla: "tinta",
  },
  "03": {
    foto: "03.png",
    rotulo: "La garantía",
    titular: "Dos citas encimadas son imposibles por diseño.",
    plantilla: "papel",
  },
  "04": {
    foto: "04.png",
    rotulo: "Caso",
    titular: "La visita quedó agendada antes de colgar.",
    plantilla: "hondo",
  },
  "05": {
    foto: "05.png",
    rotulo: "Hospitales privados",
    titular: "Su recepción cierra. Su agenda, no.",
    plantilla: "tinta",
  },
  "06": {
    foto: "06.png",
    rotulo: "Grupos restauranteros",
    titular: "Cada llamada sin contestar es una venta que se va.",
    plantilla: "tinta",
    foco: "50% 78%",
  },
};

const TEMA: Record<Plantilla, { fondo: string; texto: string; texto2: string; acento: string; rotulo: string; linea: string; logo: string }> = {
  tinta: {
    fondo: "#0b0f17",
    texto: "#eef1f7",
    texto2: "#97a2b5",
    acento: "#6e9bf5",
    rotulo: "#c8a45c",
    linea: "#212a3a",
    logo: "marca/logotipo-dimia-tinta.svg",
  },
  papel: {
    fondo: "#f2f4f8",
    texto: "#0b0f17",
    texto2: "#5a6478",
    acento: "#1f47c4",
    rotulo: "#a8853f",
    linea: "#dfe3ea",
    logo: "marca/logotipo-dimia-papel.svg",
  },
  hondo: {
    fondo: "#1f47c4",
    texto: "#ffffff",
    texto2: "#ffffffb3",
    acento: "#ffffff",
    rotulo: "#ffffffcc",
    linea: "#ffffff33",
    logo: "marca/logotipo-dimia-negativo.svg",
  },
};

export const Post: React.FC<PostProps> = ({ n, formato }) => {
  const p = POSTS[n];
  const t = TEMA[p.plantilla];
  const story = formato === "story";
  // En story el bloque de texto arranca al 57 % y termina antes del 20 % inferior.
  const altoFoto = story ? 1090 : 800;
  const padX = 72;

  const pie = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Img src={staticFile(t.logo)} style={{ width: 190 }} />
      <span style={{ fontFamily: cifras, fontSize: 22, letterSpacing: "0.24em", color: t.texto2 }}>dimia.mx</span>
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor: t.fondo }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: altoFoto, overflow: "hidden" }}>
        <Img
          src={staticFile(`posts/fotos/${p.foto}`)}
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: p.foco ?? "50% 55%" }}
        />
      </div>

      <div
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          top: altoFoto + (story ? 48 : 52),
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, borderTop: `1px solid ${t.linea}`, paddingTop: 22 }}>
          <div style={{ width: 12, height: 12, backgroundColor: t.rotulo }} />
          <span
            style={{
              fontFamily: cifras,
              fontSize: 22,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: t.rotulo,
            }}
          >
            {p.rotulo}
          </span>
        </div>

        {p.cifra ? (
          <div
            style={{
              fontFamily: cifras,
              fontVariantNumeric: "tabular-nums",
              fontSize: story ? 134 : 120,
              lineHeight: 1,
              color: t.texto,
              marginTop: 26,
              letterSpacing: "-0.02em",
            }}
          >
            {p.cifra}
          </div>
        ) : null}

        <h1
          style={{
            fontFamily: titular,
            fontWeight: 300,
            fontSize: p.cifra ? (story ? 56 : 50) : story ? 78 : 70,
            lineHeight: 1.12,
            letterSpacing: "-0.012em",
            color: t.texto,
            margin: p.cifra ? "18px 0 0" : "26px 0 0",
            textWrap: "balance",
          }}
        >
          {/* El cuadrado de remate hace de punto final, como en el logotipo. */}
          {p.titular.replace(/\.$/, "")}
          <span
            style={{
              display: "inline-block",
              width: "0.16em",
              height: "0.16em",
              backgroundColor: t.acento,
              marginLeft: "0.14em",
            }}
          />
        </h1>
        {/* En story el pie sigue al titular: nunca se encima, sea cual sea el largo de la copia. */}
        {story ? <div style={{ marginTop: 44 }}>{pie}</div> : null}
      </div>

      {story ? null : (
        <div style={{ position: "absolute", left: padX, right: padX, bottom: 56 }}>{pie}</div>
      )}
    </AbsoluteFill>
  );
};

export const ESPERA_FUENTES = interfaz; // fuerza la carga de las tres familias
