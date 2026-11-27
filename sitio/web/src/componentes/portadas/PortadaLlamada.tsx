"use client";

import { useEffect, useState } from "react";
import { FIRMA, HERO } from "@/contenido/sitio";
import ui from "../ui.module.css";
import css from "./PortadaLlamada.module.css";

type Renglon =
  | { tipo: "mensaje"; quien: "dimia" | "cliente"; nombre: string; texto: string }
  | { tipo: "dato"; etiqueta: string; valor: string };

type Escena = {
  pestana: string;
  estado: string;
  contexto: string;
  aviso: string;
  renglones: Renglon[];
  resultado: { titulo: string; dato: string; nota: string };
};

/** Ejemplos de lo que hace el sistema. Datos de ejemplo, no de clientes reales. */
const ESCENAS: Escena[] = [
  {
    pestana: "Da seguimiento",
    estado: "Recordatorio enviado",
    contexto: "09:00 · Consultorio",
    aviso: "Un día antes de la cita, sin que nadie lo mande.",
    renglones: [
      {
        tipo: "mensaje",
        quien: "dimia",
        nombre: "Dimia por WhatsApp",
        texto: "Buen día. Le recordamos su cita de mañana, martes 9 a las 10:00. ¿Nos confirma?",
      },
      { tipo: "mensaje", quien: "cliente", nombre: "Cliente", texto: "Sí, ahí estaré." },
      { tipo: "mensaje", quien: "dimia", nombre: "Dimia por WhatsApp", texto: "Gracias. Su cita queda confirmada." },
    ],
    resultado: {
      titulo: "Cita confirmada",
      dato: "Martes 9 · 10:00 · Consulta general",
      nota: "El panel la marca como confirmada",
    },
  },
  {
    pestana: "Organiza documentos",
    estado: "Factura leída",
    contexto: "11:20 · Despacho",
    aviso: "Llegó una factura por correo. Dimia la lee y la registra.",
    renglones: [
      { tipo: "dato", etiqueta: "Documento", valor: "factura.pdf" },
      { tipo: "dato", etiqueta: "Monto", valor: "$4,860.00" },
      { tipo: "dato", etiqueta: "Vence", valor: "30 de noviembre" },
      { tipo: "dato", etiqueta: "Categoría", valor: "Insumos de oficina" },
    ],
    resultado: {
      titulo: "Factura registrada",
      dato: "Pago programado · 28 de noviembre",
      nota: "Le avisa dos días antes del vencimiento",
    },
  },
  {
    pestana: "Genera reportes",
    estado: "Reporte listo",
    contexto: "Lunes 08:00 · Salón",
    aviso: "El resumen de la semana, antes de abrir.",
    renglones: [
      { tipo: "dato", etiqueta: "Citas de la semana", valor: "64" },
      { tipo: "dato", etiqueta: "Confirmadas", valor: "58" },
      { tipo: "dato", etiqueta: "Clientes nuevos", valor: "12" },
      { tipo: "dato", etiqueta: "Llamadas fuera de horario", valor: "17" },
    ],
    resultado: {
      titulo: "Reporte semanal enviado",
      dato: "Lunes · 08:00 · a su correo",
      nota: "Sin hojas de cálculo ni capturas a mano",
    },
  },
  {
    pestana: "Atiende clientes",
    estado: "Llamada contestada",
    contexto: "19:40 · Despacho contable",
    aviso: "El despacho ya cerró. El agente da la información.",
    renglones: [
      {
        tipo: "mensaje",
        quien: "cliente",
        nombre: "Cliente",
        texto: "Hola, necesito ayuda con mi declaración anual. ¿Cuánto cobran?",
      },
      {
        tipo: "mensaje",
        quien: "dimia",
        nombre: "Agente",
        texto: "La declaración anual de persona física cuesta desde $1,200. Incluye revisión de sus facturas y el envío al SAT.",
      },
      { tipo: "mensaje", quien: "cliente", nombre: "Cliente", texto: "¿Puedo hablar con un contador?" },
      {
        tipo: "mensaje",
        quien: "dimia",
        nombre: "Agente",
        texto: "Claro. Tengo espacio mañana a las 11:00 para una llamada con el contador. ¿Se la agendo?",
      },
    ],
    resultado: {
      titulo: "Llamada agendada con el contador",
      dato: "Mañana · 11:00 · Declaración anual",
      nota: "Los datos del cliente quedan en el panel",
    },
  },
];

const PASO_MS = 900;
const ESPERA_MS = 3200;

/** Portada: a la izquierda qué es Dimia; a la derecha, una pantalla que va mostrando lo que hace. */
export function PortadaLlamada() {
  const [escena, setEscena] = useState(0);
  const [visibles, setVisibles] = useState(0);
  const [quieto, setQuieto] = useState(false);

  const actual = ESCENAS[escena];
  const total = actual.renglones.length + 1; // + el resultado

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setQuieto(true);
  }, []);

  useEffect(() => {
    if (quieto) {
      setVisibles(total);
      return;
    }
    if (visibles < total) {
      const t = window.setTimeout(() => setVisibles((v) => v + 1), visibles === 0 ? 400 : PASO_MS);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => {
      setVisibles(0);
      setEscena((e) => (e + 1) % ESCENAS.length);
    }, ESPERA_MS);
    return () => window.clearTimeout(t);
  }, [visibles, total, quieto]);

  const elegir = (i: number) => {
    setEscena(i);
    setVisibles(quieto ? ESCENAS[i].renglones.length + 1 : 0);
  };

  const terminada = visibles >= total;

  return (
    <section id="inicio" className={css.portada}>
      <div className={css.rejilla}>
        <div className={css.texto}>
          <h1 className={css.titular}>{HERO.titular}</h1>
          <p className={css.entrada}>{HERO.entrada}</p>
          <div className={css.acciones}>
            <a href="#contacto" className={ui.botonPrimario}>
              {HERO.ctaPrimario}
            </a>
            <a href={FIRMA.telefonoHref} className={ui.botonSecundario}>
              {HERO.llamada}
            </a>
          </div>
          <ul className={css.datos}>
            {HERO.garantias.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>

        <div className={css.telefono}>
          <div className={css.pestanas} role="tablist" aria-label="Ejemplos de lo que hace Dimia">
            {ESCENAS.map((e, i) => (
              <button
                key={e.pestana}
                type="button"
                role="tab"
                aria-selected={i === escena}
                className={css.pestana}
                onClick={() => elegir(i)}
              >
                {e.pestana}
              </button>
            ))}
          </div>

          <div className={css.cabeza}>
            <span className={css.estado} data-terminada={terminada ? "1" : "0"}>
              <i aria-hidden="true" />
              {actual.estado}
            </span>
            <span className={css.hora}>{actual.contexto}</span>
          </div>
          <p className={css.aviso}>{actual.aviso}</p>

          <ol className={css.lineas} key={escena} aria-live="polite">
            {actual.renglones.map((r, i) =>
              r.tipo === "mensaje" ? (
                <li key={i} className={css.linea} data-quien={r.quien} data-visible={i < visibles ? "1" : "0"}>
                  <span className={css.quien}>{r.nombre}</span>
                  {r.texto}
                </li>
              ) : (
                <li key={i} className={css.dato} data-visible={i < visibles ? "1" : "0"}>
                  <span>{r.etiqueta}</span>
                  <strong>{r.valor}</strong>
                </li>
              ),
            )}
          </ol>

          <div className={css.cita} data-visible={terminada ? "1" : "0"}>
            <span className={css.citaTitulo}>{actual.resultado.titulo}</span>
            <span className={css.citaDato}>{actual.resultado.dato}</span>
            <span className={css.citaNota}>{actual.resultado.nota}</span>
          </div>

          <p className={css.ejemplo}>Ejemplos con datos ficticios.</p>
        </div>
      </div>
    </section>
  );
}
