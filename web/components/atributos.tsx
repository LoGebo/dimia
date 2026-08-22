"use client";

import { useMemo, useState } from "react";
import { Boton, Entrada, Selector } from "@/components/ui/primitivos";
import { ESQUEMAS_ATRIBUTOS, type CampoAtributo } from "@/lib/tipos";

type Valores = Record<string, unknown>;

function comoTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (Array.isArray(valor)) return valor.join(", ");
  return String(valor);
}

export function EditorAtributos({ tipo, iniciales }: { tipo: string; iniciales: Valores }) {
  const [valores, setValores] = useState<Valores>(iniciales);
  const campos = ESQUEMAS_ATRIBUTOS[tipo] ?? [];
  const clavesConocidas = useMemo(() => new Set(campos.map((c) => c.clave)), [campos]);
  const libres = Object.entries(valores).filter(([clave]) => !clavesConocidas.has(clave));
  const [nuevaClave, setNuevaClave] = useState("");
  const [nuevoValor, setNuevoValor] = useState("");

  function fijar(clave: string, valor: unknown) {
    setValores((previos) => {
      const copia = { ...previos };
      if (valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0)) {
        delete copia[clave];
      } else {
        copia[clave] = valor;
      }
      return copia;
    });
  }

  function agregarLibre() {
    const clave = nuevaClave.trim().toLowerCase().replace(/\s+/g, "_");
    if (!clave) return;
    fijar(clave, nuevoValor.trim());
    setNuevaClave("");
    setNuevoValor("");
  }

  return (
    <div className="rounded-md border border-linea bg-panel px-3 py-3">
      <input type="hidden" name="atributos" value={JSON.stringify(valores)} />
      <p className="etiqueta mb-2">Atributos</p>

      {campos.length > 0 ? (
        <div className="space-y-2.5">
          {campos.map((campo) => (
            <CampoSugerido key={campo.clave} campo={campo} valor={valores[campo.clave]} fijar={fijar} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-tinta-3">
          Este tipo no tiene campos sugeridos. Agrega los que necesites abajo.
        </p>
      )}

      {libres.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-linea pt-3">
          {libres.map(([clave, valor]) => (
            <li key={clave} className="flex items-center gap-2">
              <span className="w-32 shrink-0 truncate text-[11px] text-tinta-3">{clave}</span>
              <Entrada
                value={comoTexto(valor)}
                onChange={(e) => fijar(clave, e.target.value)}
                className="text-[12px]"
              />
              <Boton variante="peligro" type="button" onClick={() => fijar(clave, undefined)}>
                Quitar
              </Boton>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex items-end gap-2 border-t border-linea pt-3">
        <Entrada
          value={nuevaClave}
          onChange={(e) => setNuevaClave(e.target.value)}
          placeholder="otro dato"
          className="text-[12px]"
        />
        <Entrada
          value={nuevoValor}
          onChange={(e) => setNuevoValor(e.target.value)}
          placeholder="valor"
          className="text-[12px]"
        />
        <Boton type="button" onClick={agregarLibre}>
          Agregar
        </Boton>
      </div>
    </div>
  );
}

function CampoSugerido({
  campo,
  valor,
  fijar,
}: {
  campo: CampoAtributo;
  valor: unknown;
  fijar: (clave: string, valor: unknown) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-32 shrink-0 text-[12px] text-tinta-2">{campo.etiqueta}</span>
        <div className="min-w-0 flex-1">
          {campo.tipo === "texto" ? (
            <Entrada
              value={comoTexto(valor)}
              onChange={(e) => fijar(campo.clave, e.target.value)}
              className="text-[12px]"
            />
          ) : null}
          {campo.tipo === "numero" ? (
            <Entrada
              type="number"
              value={comoTexto(valor)}
              onChange={(e) => fijar(campo.clave, e.target.value === "" ? undefined : Number(e.target.value))}
              className="text-[12px]"
            />
          ) : null}
          {campo.tipo === "booleano" ? (
            <Selector
              value={valor === true ? "si" : valor === false ? "no" : ""}
              onChange={(e) =>
                fijar(campo.clave, e.target.value === "" ? undefined : e.target.value === "si")
              }
              className="text-[12px]"
            >
              <option value="">Sin especificar</option>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </Selector>
          ) : null}
          {campo.tipo === "opcion" ? (
            <Selector
              value={comoTexto(valor)}
              onChange={(e) => fijar(campo.clave, e.target.value)}
              className="text-[12px]"
            >
              <option value="">Sin especificar</option>
              {campo.opciones.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Selector>
          ) : null}
          {campo.tipo === "multiple" ? (
            <div className="flex flex-wrap gap-1">
              {campo.opciones.map((o) => {
                const lista = Array.isArray(valor) ? (valor as string[]) : [];
                const activo = lista.includes(o);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() =>
                      fijar(campo.clave, activo ? lista.filter((x) => x !== o) : [...lista, o])
                    }
                    className={`rounded border px-1.5 py-0.5 text-[11px] transition ${
                      activo
                        ? "border-acento bg-acento-suave text-acento"
                        : "border-linea bg-panel-2 text-tinta-3 hover:text-tinta"
                    }`}
                  >
                    {o}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      {campo.ayuda ? <p className="mt-0.5 pl-34 text-[10px] text-tinta-3">{campo.ayuda}</p> : null}
    </div>
  );
}
