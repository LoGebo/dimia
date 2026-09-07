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

/**
 * Los `entrada` de cada escena están puestos contra la locución: el elemento
 * termina de entrar justo cuando la voz lo nombra. Los segundos de referencia
 * van en el comentario de cada escena. Si se cambia la voz, se recalculan aquí
 * y se vuelve a correr `audio.sh`.
 */

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
// Voz 0.90 – 6.00 s · «Su negocio recibe llamadas a toda hora.» (0.90–3.15)
//                     «Las que no alcanza a contestar son ventas perdidas.» (3.56–6.00)

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
  const cambio = 106; // 3.53 s: entra la segunda frase de la voz

  return (
    <Escena duracion={duracion}>
      <AbsoluteFill style={marco}>
        <div style={{ marginBottom: 54 }}>
          <Rotulo texto="El problema" entrada={4} />
        </div>

        <div style={{ position: "relative", height: 258, marginBottom: 16 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              opacity: interpolate(f, [96, 110], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <Titular entrada={6} tamano={70} remate>
              Su negocio recibe
              <br />
              llamadas a toda hora
            </Titular>
          </div>
          <div style={{ position: "absolute", inset: 0, opacity: aparecer(f, cambio, 18) }}>
            <Titular entrada={cambio} tamano={70} remate>
              Las que no alcanza
              <br />
              a contestar son
              <br />
              ventas perdidas
            </Titular>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${columnas}, 1fr)`,
            gap: 22,
            marginTop: 44,
          }}
        >
          {HORAS.map((hora, i) => {
            const entra = 24 + i * 3;
            const o = aparecer(f, entra, 10);
            // Las de la segunda mitad del día se apagan mientras la voz lo dice.
            const sePierde = i % 3 === 1 || i > 17;
            const apagado = sePierde
              ? interpolate(f, [120 + (i % 6) * 4, 138 + (i % 6) * 4], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: suave,
                })
              : 0;
            return (
              <div
                key={hora}
                style={{ opacity: o, transform: `scale(${interpolate(o, [0, 1], [0.6, 1])})` }}
              >
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
// Voz 7.39 – 12.43 s · «Este es el Panel Dimia.» (7.39–8.65)
//                       «Todo lo que la inteligencia artificial puede gestionar…» (9.12–12.43)

export const EscenaPanel: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={40}>
    <AbsoluteFill style={{ ...marco, justifyContent: "center" }}>
      <Rotulo texto="Panel Dimia" entrada={2} />
      <div style={{ height: 40 }} />
      <Titular entrada={10} tamano={64}>
        Todo lo que la inteligencia
        <br />
        artificial puede gestionar
      </Titular>
      <div style={{ height: 26 }} />
      <Cuerpo entrada={26}>
        En un solo lugar, las{" "}
        <span style={{ fontFamily: cifras, fontVariantNumeric: "tabular-nums" }}>24</span> horas del día.
      </Cuerpo>
      <div style={{ height: 44 }} />
      <VentanaPanel
        fuente="panel/hoy.png"
        foco={[0.5, 0.5]}
        zoom={1.0}
        focoFin={[0.44, 0.30]}
        zoomFin={1.28}
        alto={588}
        entrada={22}
        recorrido={175}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// ----------------------------------------------------------------- 3. contesta
// Voz 14.05 – 19.04 s · «Contesta al segundo.» (14.05–15.05)
//                        «Cada conversación queda registrada.» (15.47–16.92)
//                        «qué preguntaron y en qué terminó.» (17.33–19.04)

export const EscenaContesta: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={90}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 180 }}>
      <Rotulo texto="Contesta" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={10} tamano={70} remate>
        Contesta
        <br />
        al segundo
      </Titular>
      <div style={{ height: 30 }} />
      <Cuerpo entrada={40}>
        Cada conversación queda registrada.
      </Cuerpo>
      <div style={{ height: 54 }} />
      <VentanaPanel
        fuente="panel/bandeja.png"
        foco={[0.80, 0.24]}
        zoom={2.1}
        focoFin={[0.86, 0.68]}
        zoomFin={2.25}
        alto={900}
        entrada={50}
        recorrido={145}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// ------------------------------------------------------------------- 4. agenda
// Voz 20.45 – 24.39 s · «Y cuelga con la cita ya agendada.» (20.45–22.00)
//                        «Si un cliente necesita agendar, Dimia lo hace por usted.» (22.38–24.39)

export const EscenaAgenda: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={140}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 180 }}>
      <Rotulo texto="Agenda" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={8} tamano={70} remate>
        Y cuelga con la
        <br />
        cita ya agendada
      </Titular>
      <div style={{ height: 30 }} />
      <Cuerpo entrada={26}>
        Si un cliente necesita agendar, Dimia lo hace por usted.
      </Cuerpo>
      <div style={{ height: 54 }} />
      <VentanaPanel
        fuente="panel/agenda.png"
        foco={[0.30, 0.14]}
        zoom={2.0}
        focoFin={[0.24, 0.58]}
        zoomFin={2.15}
        alto={900}
        entrada={30}
        recorrido={128}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// --------------------------------------------------------------------- 5. mide
// Voz 25.71 – 31.74 s · «Usted ve qué pasó.» (25.71–26.56)
//                        «Noventa y tres llamadas.» (27.01–28.40)
//                        «Ochenta y siete por ciento resueltas…» (28.90–31.74)
// Cada cifra termina de entrar en el fotograma en que la voz la nombra.

export const EscenaMide: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={190}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 180 }}>
      <Rotulo texto="Mide" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={8} tamano={70} remate>
        Y usted ve
        <br />
        qué pasó
      </Titular>
      <div style={{ height: 46 }} />
      <div style={{ display: "flex", gap: 44 }}>
        <Cifra valor="93" pie="llamadas en 14 días" entrada={44} />
        <Cifra valor="87%" pie="resueltas sin humano" entrada={101} />
        <Cifra valor="2:27" pie="duración promedio" entrada={140} />
      </div>
      <div style={{ height: 52 }} />
      <VentanaPanel
        fuente="panel/informe.png"
        foco={[0.30, 0.58]}
        zoom={1.8}
        focoFin={[0.34, 0.88]}
        zoomFin={1.9}
        alto={820}
        entrada={40}
        recorrido={180}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// ----------------------------------------------------------------- 6. se opera
// Voz 33.17 – 39.21 s · «Y usted decide cómo contesta.» (33.17–34.74)
//                        «Horarios, servicios y saludo. Contesta también…» (35.30–39.21)

export const EscenaOpera: React.FC<{ duracion: number }> = ({ duracion }) => (
  <Escena duracion={duracion} deriva={240}>
    <AbsoluteFill style={{ ...marco, justifyContent: "flex-start", paddingTop: 190 }}>
      <Rotulo texto="Se opera" entrada={4} />
      <div style={{ height: 36 }} />
      <Titular entrada={8} tamano={70} remate>
        Usted decide
        <br />
        cómo contesta
      </Titular>
      <div style={{ height: 30 }} />
      <Cuerpo entrada={63}>
        Horarios, servicios y saludo. Contesta también cuando usted cierra.
      </Cuerpo>
      <div style={{ height: 54 }} />
      <VentanaPanel
        fuente="panel/agente.png"
        foco={[0.30, 0.20]}
        zoom={1.9}
        focoFin={[0.36, 0.50]}
        zoomFin={1.98}
        alto={860}
        entrada={70}
        recorrido={150}
      />
    </AbsoluteFill>
    <AvisoDemo />
  </Escena>
);

// -------------------------------------------------------------------- 7. cierre
// Voz 40.51 – 42.22 s · «Dimia. Donde el dato decide.» — la voz junta las dos frases

export const EscenaCierre: React.FC<{ duracion: number }> = ({ duracion }) => {
  const f = useCurrentFrame();
  const logo = aparecer(f, 2, 22); // cierra de entrar sobre la palabra «Dimia»
  const linea = interpolate(f, [34, 62], [0, 1], {
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
        <div style={{ opacity: aparecer(f, 34, 22), textAlign: "center" }}>
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
