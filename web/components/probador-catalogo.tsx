"use client";

import { useState, useTransition } from "react";
import { probarCatalogo } from "@/lib/acciones";
import { Boton, Entrada, Selector, Vacio } from "@/components/ui/primitivos";
import { moneda } from "@/lib/formato";
import { etiquetaTipo, type ResultadoCatalogo } from "@/lib/tipos";

const EJEMPLOS = ["algo sin lácteos", "tacos de pastol", "el más picante", "quién ve niños"];

export function ProbadorCatalogo({ tipos }: { tipos: string[] }) {
  const [consulta, setConsulta] = useState("");
  const [tipo, setTipo] = useState("");
  const [resultados, setResultados] = useState<ResultadoCatalogo[] | null>(null);
  const [buscando, iniciar] = useTransition();

  function buscar(texto: string) {
    const limpio = texto.trim();
    setConsulta(texto);
    if (!limpio) {
      setResultados(null);
      return;
    }
    iniciar(async () => {
      setResultados(await probarCatalogo(limpio, tipo || null));
    });
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          buscar(consulta);
        }}
        className="space-y-2 border-b border-linea px-4 py-3"
      >
        <Entrada
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="Escribe lo que diría un cliente…"
        />
        <div className="flex items-center gap-2">
          <Selector value={tipo} onChange={(e) => setTipo(e.target.value)} className="flex-1">
            <option value="">Todos los tipos</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {etiquetaTipo(t, true)}
              </option>
            ))}
          </Selector>
          <Boton variante="solido" type="submit" disabled={buscando}>
            {buscando ? "Buscando…" : "Probar"}
          </Boton>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-linea px-4 py-2">
        <span className="text-[11px] text-tinta-3">Prueba con:</span>
        {EJEMPLOS.map((e) => (
          <button
            key={e}
            onClick={() => buscar(e)}
            className="rounded border border-linea bg-panel-2 px-1.5 py-0.5 text-[11px] text-tinta-2 transition hover:border-acento hover:text-acento"
          >
            {e}
          </button>
        ))}
      </div>

      {resultados === null ? (
        <Vacio
          titulo="Esto es lo que oye el agente"
          detalle="Escribe una frase como la diría un cliente por teléfono. Lo que aparezca aquí es exactamente lo que la herramienta le devuelve: si algo no sale, el agente no lo va a decir."
        />
      ) : resultados.length === 0 ? (
        <Vacio
          titulo="La herramienta no devolvería nada"
          detalle="Con esta frase el agente diría que no tiene el dato y ofrecería transferir. Agrega alias o ajusta la descripción del item que esperabas ver."
        />
      ) : (
        <ul className="divide-y divide-linea">
          {resultados.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-tinta">{r.nombre}</span>
                  <span className="text-[11px] text-tinta-3">{etiquetaTipo(r.tipo)}</span>
                </div>
                {r.descripcion ? (
                  <p className="truncate text-[11px] text-tinta-3">{r.descripcion}</p>
                ) : null}
                <Atributos atributos={r.atributos} />
              </div>
              <span className="numeros w-16 text-right text-[12px] text-tinta-2">{moneda(r.precio)}</span>
              <div className="w-20">
                <div className="h-1.5 rounded-full bg-linea">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(6, r.puntaje * 140))}%`,
                      background: "var(--serie-1)",
                    }}
                  />
                </div>
                <span className="numeros mt-0.5 block text-right text-[10px] text-tinta-3">
                  {r.puntaje.toFixed(2)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Atributos({ atributos }: { atributos: Record<string, unknown> }) {
  const pares = Object.entries(atributos).filter(([, valor]) =>
    Array.isArray(valor) ? valor.length > 0 : valor !== null && valor !== "",
  );
  if (pares.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {pares.map(([clave, valor]) => (
        <span key={clave} className="rounded bg-panel-2 px-1 py-px text-[10px] text-tinta-3">
          {clave}: {Array.isArray(valor) ? valor.join(", ") : String(valor)}
        </span>
      ))}
    </div>
  );
}
