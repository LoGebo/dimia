"use client";

import { useState } from "react";
import { Campo, Entrada, Selector } from "@/components/ui/primitivos";
import { AJUSTES_TTS, PROVEEDORES_TTS, type ProveedorTts, type TtsAjustes } from "@/lib/tipos";

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
  const campos = AJUSTES_TTS[actual];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Proveedor de voz">
          <Selector
            name="tts_proveedor"
            value={actual}
            onChange={(e) => setActual(e.target.value as ProveedorTts)}
          >
            {PROVEEDORES_TTS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.nombre} — {p.detalle}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="ID de la voz" ayuda="Se copia del panel del proveedor.">
          <Entrada name="voz_id" defaultValue={vozId ?? ""} placeholder="21m00Tcm4TlvDq8ikWAM" />
        </Campo>
      </div>

      <div className="rounded-md border border-linea bg-panel-2 px-3 py-3">
        <p className="etiqueta mb-2.5">Ajustes de {actual === "elevenlabs" ? "ElevenLabs" : "Cartesia"}</p>
        <div className="space-y-3">
          {campos.map((campo) => (
            <Deslizador
              key={`${actual}-${campo.clave}`}
              nombre={`tts_${campo.clave}`}
              etiqueta={campo.etiqueta}
              ayuda={campo.ayuda}
              min={campo.min}
              max={campo.max}
              paso={campo.paso}
              inicial={ajustes[campo.clave] ?? campo.porDefecto}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Deslizador({
  nombre,
  etiqueta,
  ayuda,
  min,
  max,
  paso,
  inicial,
}: {
  nombre: string;
  etiqueta: string;
  ayuda: string;
  min: number;
  max: number;
  paso: number;
  inicial: number;
}) {
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
