import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import {
  AvisoDemo,
  Cifra,
  Cuerpo,
  Fondo,
  Rotulo,
  Titular,
  VentanaPanel,
  aparecer,
  suave,
} from "./componentes";
import { color } from "./marca";
import { cifras, interfaz } from "./tipografia";

/** Envoltura: apaga la escena en sus últimos fotogramas para el encadenado. */
const Escena: React.FC<{ duracion: number; children: React.ReactNode; deriva?: number }> = ({
  duracion,
  children,
  deriva = 0,
}) => {
  const f = useCurrentFrame();
  const salida = interpolate(f, [duracion - 14, duracion - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ opacity: salida }}>
      <Fondo deriva={deriva} />
      {children}
    </AbsoluteFill>
  );
};

const marco: React.CSSProperties = {
  padding: "0 70px",
  justifyContent: "center",
};

// ---------------------------------------------------------------- 1. llamadas

const HORAS = [
  "07:12", "08:41", "09:03", "10:26", "11:58", "12:04",
  "13:37", "14:19", "15:02", "16:45", "17:23", "18:09",
  "19:51", "20:14", "21:38", "22:07", "23:16", "23:49",
  "00:22", "01:05", "02:41", "03:18", "05:57", "06:33",
];

/** Cada cuadrado es una llamada. Las que caen fuera de horario se apagan. */
export const EscenaLlamadas: React.FC<{ duracion: number }> = ({ duracion }) => {
  const f = useCurrentFrame();
  const columnas = 6;
  const cambio = 152;

  return (
    <Escena duracion={duracion}>
      <AbsoluteFill style={marco}>
        <div style={{ marginBottom: 54 }}>
          <Rotulo texto="El problema" entrada={6} />
        </div>

        <div style={{ position: "relative", height: 210, marginBottom: 16 }}>
          <div style={{ position: "absolute", inset: 0, opacity: interpolate(f, [130, 148], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <Titular entrada={16} remate>
              Su negocio recibe
              <br />
              llamadas a toda hora
            </Titular>
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: aparecer(f, cambio, 18) }}>
            <Titular entrada={cambio} remate>
              Las que no alcanza
              <br />
              a contestar, se pierden
            </Titular>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnas}, 1fr)`,
            gap: 22,
            marginTop: 70,
          }}
        >
          {HORAS.map((hora, i) => {
            const entra = 26 + i * 4.5;
            const o = aparecer(f, entra, 10);
            // Las de la segunda mitad del día se apagan en la segunda frase.
            const sePierde = i % 3 === 1 || i > 17;
            const apagado = sePierde
              ? interpolate(f, [cambio + 14 + (i % 6) * 5, cambio + 34 + (i % 6) * 5], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: suave,
                })
              : 0;
            return (
              <div key={hora} style={{ opacity: o, transform: `scale(${interpolate(o, [0, 1], [0.6, 1])})` }}>
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1",
                    backgroundColor: color.azul,
                    opacity: interpolate(apagado, [0, 1], [1, 0.12]),
                  }}
                />
                <div
                  style={{
                    fontFamily: cifras,
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 19,
                    color: `${color.hueso}${apagado > 0.5 ? "40" : "8c"}`,
                    marginTop: 10,
                    textAlign: "center",
                  }}
                >
                  {hora}
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>
    </Escena>
  );
};

// ------------------------------------------------------------ 2. entra el panel

export const EscenaPanel: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={40}>
    <AbsoluteFill style={{ ...marco, justifyContent: "center" }}>
      <Rotulo texto="Panel Dimia" entrada={4} />
      <div style={{ height: 40 }} />
      <Titular entrada={14} tamano={72}>
        Todo lo que el agente
        <br />
        atendió, en un lugar
      </Titular>
      <div style={{ height: 62 }} />
      <VentanaPanel
        fuente="panel/hoy.png"
        foco={[0.5, 0.5]}
        zoom={1.0}
        focoFin={[0.44, 0.30]}
        zoomFin={1.28}
        alto={588}
        entrada={30}
        recorrido={160}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// ----------------------------------------------------------------- 3. contesta

export const EscenaContesta: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={90}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 180 }}>
      <Rotulo texto="Contesta" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={12} tamano={70} remate>
        Contesta al
        <br />
        primer timbre
      </Titular>
      <div style={{ height: 30 }} />
      <Cuerpo entrada={28}>
        Cada conversación queda escrita: qué preguntaron, qué respondió y en qué terminó.
      </Cuerpo>
      <div style={{ height: 54 }} />
      <VentanaPanel
        fuente="panel/bandeja.png"
        foco={[0.80, 0.24]}
        zoom={2.1}
        focoFin={[0.86, 0.68]}
        zoomFin={2.25}
        alto={900}
        entrada={34}
        recorrido={170}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// ------------------------------------------------------------------- 4. agenda

export const EscenaAgenda: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={140}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 180 }}>
      <Rotulo texto="Agenda" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={12} tamano={70} remate>
        Y cuelga con la
        <br />
        cita ya escrita
      </Titular>
      <div style={{ height: 30 }} />
      <Cuerpo entrada={28}>
        El motor de reservas vive en la base de datos: dos citas encimadas son imposibles.
      </Cuerpo>
      <div style={{ height: 54 }} />
      <VentanaPanel
        fuente="panel/agenda.png"
        foco={[0.30, 0.14]}
        zoom={2.0}
        focoFin={[0.24, 0.58]}
        zoomFin={2.15}
        alto={900}
        entrada={34}
        recorrido={170}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// --------------------------------------------------------------------- 5. mide

export const EscenaMide: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={190}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 180 }}>
      <Rotulo texto="Mide" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={12} tamano={70} remate>
        Y usted ve
        <br />
        qué pasó
      </Titular>
      <div style={{ height: 46 }} />
      <div style={{ display: "flex", gap: 44 }}>
        <Cifra valor="93" pie="llamadas en 14 días" entrada={30} />
        <Cifra valor="87%" pie="resueltas sin humano" entrada={40} />
        <Cifra valor="2:27" pie="duración promedio" entrada={50} />
      </div>
      <div style={{ height: 52 }} />
      <VentanaPanel
        fuente="panel/informe.png"
        foco={[0.30, 0.58]}
        zoom={1.8}
        focoFin={[0.34, 0.88]}
        zoomFin={1.9}
        alto={820}
        entrada={50}
        recorrido={160}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// ----------------------------------------------------------------- 6. se opera

export const EscenaOpera: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={240}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 190 }}>
      <Rotulo texto="Se opera" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={12} tamano={70} remate>
        Usted decide
        <br />
        cómo contesta
      </Titular>
      <div style={{ height: 30 }} />
      <Cuerpo entrada={26}>
        Horarios, servicios, saludo y a dónde pasa lo que no resuelve. Sin escribir código.
      </Cuerpo>
      <div style={{ height: 54 }} />
      <VentanaPanel
        fuente="panel/agente.png"
        foco={[0.30, 0.20]}
        zoom={1.9}
        focoFin={[0.36, 0.50]}
        zoomFin={1.98}
        alto={860}
        entrada={32}
        recorrido={130}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// -------------------------------------------------------------------- 7. cierre

export const EscenaCierre: React.FC<{ duracion: number }> = ({ duracion }) => {
  const f = useCurrentFrame();
  const logo = aparecer(f, 10, 26);
  const linea = interpolate(f, [30, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: suave,
  });
  return (
    <Escena duracion={duracion} deriva={300}>
      <AbsoluteFill style={{ ...marco, alignItems: "center", justifyContent: "center" }}>
        <Img
          src={staticFile("marca/logotipo-dimia-tinta.svg")}
          style={{
            width: 620,
            opacity: logo,
            transform: `translateY(${interpolate(logo, [0, 1], [18, 0])}px)`,
          }}
        />
        <div
          style={{
            width: 620 * linea,
            height: 1,
            backgroundColor: `${color.hueso}2e`,
            margin: "56px 0",
          }}
        />
        <div style={{ opacity: aparecer(f, 52, 24), textAlign: "center" }}>
          <div
            style={{
              fontFamily: interfaz,
              fontWeight: 500,
              fontSize: 40,
              color: color.hueso,
              letterSpacing: "-0.01em",
            }}
          >
            Donde el dato decide
          </div>
          <div
            style={{
              fontFamily: cifras,
              fontSize: 26,
              letterSpacing: "0.26em",
              color: color.azul,
              marginTop: 34,
            }}
          >
            dimia.mx
          </div>
        </div>
      </AbsoluteFill>
    </Escena>
  );
};
