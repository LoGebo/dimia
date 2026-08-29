"use client";

import { useState } from "react";
import { Campo, Entrada, Insignia, Selector } from "@/components/ui/primitivos";
import {
  AJUSTES_ELEVENLABS,
  FORMATO_VOZ,
  MODELOS_ELEVENLABS,
  MODELOS_LLM,
  PROVEEDORES_LLM,
  PROVEEDORES_TTS,
  VELOCIDAD_AZURE,
  VOCES_AZURE,
  modeloPorDefecto,
  vozValida,
  type CampoDeslizador,
  type ProveedorLlm,
  type ProveedorTts,
  type TtsAjustes,
} from "@/lib/tipos";

function Bloque({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-linea bg-panel-2 px-3 py-3">
      <p className="etiqueta">{titulo}</p>
      <p className="mt-0.5 mb-3 text-[11px] text-tinta-3">{descripcion}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function ConfiguracionCerebro({
  proveedor,
  modelo,
}: {
  proveedor: ProveedorLlm;
  modelo: string | null;
}) {
  const [actual, setActual] = useState<ProveedorLlm>(proveedor);
  const [texto, setTexto] = useState(modelo ?? "");
  const opciones = MODELOS_LLM[actual];
  const porDefecto = modeloPorDefecto(actual);
  const elegido = texto.trim() || porDefecto;

  return (
    <Bloque
      titulo="Cerebro"
      descripcion="Quién razona durante la llamada. Cambiarlo se nota en qué tan bien entiende y en cuánto cuesta."
    >
      <Campo etiqueta="Proveedor">
        <Selector
          name="llm_proveedor"
          value={actual}
          onChange={(e) => {
            setActual(e.target.value as ProveedorLlm);
            setTexto("");
          }}
        >
          {PROVEEDORES_LLM.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nombre} — {p.detalle}
            </option>
          ))}
        </Selector>
      </Campo>

      <Campo
        etiqueta="Modelo"
        ayuda={`Vacío usa ${porDefecto}. Puedes escribir cualquier modelo del proveedor.`}
      >
        <Entrada
          name="llm_modelo"
          list={`modelos-${actual}`}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={porDefecto}
          spellCheck={false}
        />
      </Campo>
      <datalist id={`modelos-${actual}`}>
        {opciones.map((m) => (
          <option key={m.id} value={m.id} />
        ))}
      </datalist>

      <ul className="divide-y divide-linea border border-linea bg-panel">
        {opciones.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-3 px-2.5 py-2">
            <button
              type="button"
              onClick={() => setTexto(m.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="flex items-center gap-1.5">
                <span className="text-[12px] font-medium text-tinta">{m.nombre}</span>
                {m.id === elegido ? <Insignia tono="acento">En uso</Insignia> : null}
              </span>
              <span className="block truncate text-[11px] text-tinta-3">{m.detalle}</span>
            </button>
            <span className="numeros shrink-0 text-[11px] text-tinta-2">
              ~${m.costoMinuto.toFixed(3)}/min
            </span>
          </li>
        ))}
      </ul>
    </Bloque>
  );
}

export function ConfiguracionVoz({
  proveedor,
  vozId,
  ajustes,
}: {
  proveedor: ProveedorTts;
  vozId: string | null;
  ajustes: TtsAjustes;
}) {
  const [actual, setActual] = useState<ProveedorTts>(proveedor);
  const [voz, setVoz] = useState(vozId ?? "");
  const formato = FORMATO_VOZ[actual];
  const mismos = actual === proveedor;
  const invalida = voz.trim().length > 0 && !vozValida(actual, voz.trim());

  return (
    <Bloque
      titulo="Voz"
      descripcion="Cómo suena al contestar. El precio es por hora de llamada, no por mes."
    >
      <Campo etiqueta="Proveedor">
        <Selector
          name="tts_proveedor"
          value={actual}
          onChange={(e) => {
            const nuevo = e.target.value as ProveedorTts;
            setActual(nuevo);
            setVoz(nuevo === proveedor ? (vozId ?? "") : nuevo === "azure" ? VOCES_AZURE[0]!.id : "");
          }}
        >
          {PROVEEDORES_TTS.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.nombre} — {p.detalle} (~${p.costoHora.toFixed(2)}/hora)
            </option>
          ))}
        </Selector>
      </Campo>

      {actual === "azure" ? (
        <>
          <Campo etiqueta="Voz" ayuda="Todas son de español de México.">
            <Selector name="voz_id" value={voz} onChange={(e) => setVoz(e.target.value)}>
              {VOCES_AZURE.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre} — {v.detalle}
                </option>
              ))}
            </Selector>
          </Campo>
          <Deslizador
            nombre="tts_rate"
            etiqueta="Velocidad"
            ayuda="1.0 es el ritmo natural. Arriba de 1.3 empieza a atropellarse."
            min={VELOCIDAD_AZURE.min}
            max={VELOCIDAD_AZURE.max}
            paso={VELOCIDAD_AZURE.paso}
            inicial={numeroDe(mismos ? ajustes.prosodia?.rate : undefined, VELOCIDAD_AZURE.porDefecto)}
          />
        </>
      ) : (
        <Campo etiqueta="ID de la voz" ayuda={`${formato.formato}. ${formato.donde}`}>
          <Entrada
            name="voz_id"
            value={voz}
            onChange={(e) => setVoz(e.target.value)}
            placeholder={formato.ejemplo}
            spellCheck={false}
          />
        </Campo>
      )}

      {invalida ? (
        <p className="border border-alerta/30 bg-alerta/10 px-2.5 py-1.5 text-[11px] text-alerta">
          Ese ID no tiene el formato de {formato.formato} que espera el proveedor. Ejemplo:{" "}
          <span className="">{formato.ejemplo}</span>.
        </p>
      ) : null}

      {actual === "elevenlabs" ? (
        <div className="space-y-3 border border-linea bg-panel px-2.5 py-2.5">
          <Campo etiqueta="Modelo" ayuda="Mismo precio. Conversacional suena más humano; Flash contesta más rápido.">
            <Selector name="tts_modelo" defaultValue={(mismos && typeof ajustes.modelo === "string" ? ajustes.modelo : "") || MODELOS_ELEVENLABS[0]!.id}>
              {MODELOS_ELEVENLABS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre} — {m.detalle}
                </option>
              ))}
            </Selector>
          </Campo>
          {AJUSTES_ELEVENLABS.map((campo) => (
            <Deslizador
              key={campo.clave}
              nombre={`tts_${campo.clave}`}
              etiqueta={campo.etiqueta}
              ayuda={campo.ayuda}
              min={campo.min}
              max={campo.max}
              paso={campo.paso}
              inicial={numeroDe(mismos ? ajustes[campo.clave] : undefined, campo.porDefecto)}
            />
          ))}
        </div>
      ) : null}

      {!mismos ? (
        <p className="text-[11px] text-tinta-3">
          Al guardar se descartan los ajustes de {nombreDe(proveedor)}: no son compatibles y tumbarían
          la llamada.
        </p>
      ) : null}
    </Bloque>
  );
}

function nombreDe(proveedor: ProveedorTts): string {
  return PROVEEDORES_TTS.find((p) => p.valor === proveedor)?.nombre ?? proveedor;
}

function numeroDe(valor: unknown, porDefecto: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) && valor !== null && valor !== "" ? numero : porDefecto;
}

function Deslizador({
  nombre,
  etiqueta,
  ayuda,
  min,
  max,
  paso,
  inicial,
}: Omit<CampoDeslizador, "clave" | "porDefecto"> & { nombre: string; inicial: number }) {
  const [valor, setValor] = useState(inicial);
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-tinta-2">{etiqueta}</span>
        <span className="numeros text-[12px] font-medium text-tinta">{valor.toFixed(2)}</span>
      </span>
      <input
        type="range"
        name={nombre}
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => setValor(Number(e.target.value))}
        className="mt-1 w-full accent-acento"
      />
      <span className="mt-0.5 block text-[10px] text-tinta-3">{ayuda}</span>
    </label>
  );
}
