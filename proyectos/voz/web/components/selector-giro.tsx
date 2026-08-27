"use client";

import { useState } from "react";
import { AreaTexto, Campo, Entrada } from "@/components/ui/primitivos";
import type { Herramienta, PlantillaVertical } from "@/lib/tipos";

export const GIRO_PROPIO = "propio";

function queHace(herramientas: Herramienta[]): string {
  if (herramientas.includes("pedido")) return "Toma pedidos y los cobra";
  if (herramientas.includes("agendar")) return "Aparta horarios en la agenda";
  return "Contesta y toma recado";
}

const CAPACIDADES: { valor: Herramienta; nombre: string; detalle: string }[] = [
  { valor: "agendar", nombre: "Agenda citas", detalle: "Aparta horarios en recursos con duración." },
  { valor: "pedido", nombre: "Toma pedidos", detalle: "Arma el pedido con precios del catálogo." },
  { valor: "recado", nombre: "Toma recados", detalle: "Nombre, teléfono y asunto para regresar la llamada." },
];

export type EstadoGiro = { giro: string; propio: boolean; faltantes: string[] };

/**
 * Elige el giro del negocio. «Otro giro» abre tres campos: cómo se llama, qué
 * hace el agente y cómo es el negocio. Avisa al padre qué falta para que el
 * botón de envío se quede con candado hasta que esté completo.
 */
export function SelectorGiro({
  plantillas,
  onCambio,
}: {
  plantillas: PlantillaVertical[];
  onCambio?: (estado: EstadoGiro) => void;
}) {
  const [giro, setGiro] = useState(plantillas[0]?.clave ?? GIRO_PROPIO);
  const [nombre, setNombre] = useState("");
  const [capacidades, setCapacidades] = useState<Herramienta[]>(["agendar", "recado"]);

  function avisar(g: string, n: string, c: Herramienta[]) {
    const propio = g === GIRO_PROPIO;
    const faltantes: string[] = [];
    if (propio && !n.trim()) faltantes.push("el nombre del giro");
    if (propio && c.length === 0) faltantes.push("al menos una cosa que haga el agente");
    onCambio?.({ giro: g, propio, faltantes });
  }

  const propio = giro === GIRO_PROPIO;

  return (
    <>
      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-tinta-2">Giro</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {plantillas.map((p) => (
            <label
              key={p.clave}
              className="cursor-pointer border border-linea bg-panel px-3 py-2.5 transition has-checked:border-acento has-checked:bg-acento-suave"
            >
              <input
                type="radio"
                name="vertical"
                value={p.clave}
                checked={giro === p.clave}
                onChange={() => {
                  setGiro(p.clave);
                  avisar(p.clave, nombre, capacidades);
                }}
                className="sr-only"
              />
              <span className="block text-[13px] font-medium text-tinta">{p.nombre}</span>
              <span className="mt-0.5 block text-[11px] text-tinta-3">{queHace(p.herramientas)}</span>
            </label>
          ))}
          <label className="cursor-pointer border border-dashed border-linea-fuerte bg-panel px-3 py-2.5 transition has-checked:border-solid has-checked:border-acento has-checked:bg-acento-suave">
            <input
              type="radio"
              name="vertical"
              value={GIRO_PROPIO}
              checked={propio}
              onChange={() => {
                setGiro(GIRO_PROPIO);
                avisar(GIRO_PROPIO, nombre, capacidades);
              }}
              className="sr-only"
            />
            <span className="block text-[13px] font-medium text-tinta">Otro giro</span>
            <span className="mt-0.5 block text-[11px] text-tinta-3">Tú dices qué es y qué hace el agente</span>
          </label>
        </div>
      </fieldset>

      {propio ? (
        <div className="space-y-3 border border-linea bg-panel-2 px-4 py-4">
          <Campo etiqueta="Nombre del giro" ayuda="Como lo dirías en una frase: veterinaria, despacho contable, gimnasio.">
            <Entrada
              name="giro_nombre"
              placeholder="Veterinaria"
              value={nombre}
              required
              onChange={(e) => {
                setNombre(e.target.value);
                avisar(giro, e.target.value, capacidades);
              }}
            />
          </Campo>
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-tinta-2">Qué hace el agente</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {CAPACIDADES.map((c) => (
                <label
                  key={c.valor}
                  className="cursor-pointer border border-linea bg-panel px-3 py-2.5 transition has-checked:border-acento has-checked:bg-acento-suave"
                >
                  <input
                    type="checkbox"
                    name="giro_herramientas"
                    value={c.valor}
                    checked={capacidades.includes(c.valor)}
                    onChange={() => {
                      const siguiente = capacidades.includes(c.valor)
                        ? capacidades.filter((x) => x !== c.valor)
                        : [...capacidades, c.valor];
                      setCapacidades(siguiente);
                      avisar(giro, nombre, siguiente);
                    }}
                    className="sr-only"
                  />
                  <span className="block text-[13px] font-medium text-tinta">{c.nombre}</span>
                  <span className="mt-0.5 block text-[11px] text-tinta-3">{c.detalle}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Campo
            etiqueta="Cómo es el negocio"
            ayuda="Dos o tres líneas: a quién atiende, cómo le habla, qué no debe hacer. Es el contexto con el que contesta."
          >
            <AreaTexto
              name="giro_instrucciones"
              rows={3}
              placeholder="Clínica veterinaria. Trata a quien llama como dueño de mascota. Si describen una emergencia, transfiere de inmediato."
            />
          </Campo>
        </div>
      ) : null}
    </>
  );
}
