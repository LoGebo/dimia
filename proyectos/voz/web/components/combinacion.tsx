import Link from "next/link";
import { Insignia } from "@/components/ui/primitivos";
import {
  MODELOS_LLM,
  PROVEEDORES_TTS,
  modeloPorDefecto,
  nombreModelo,
  nombreProveedorTts,
  nombreVoz,
  type Negocio,
} from "@/lib/tipos";

export function CombinacionActiva({ negocio }: { negocio: Negocio }) {
  const modelo = negocio.llm_modelo || modeloPorDefecto(negocio.llm_proveedor);
  const cerebro = nombreModelo(negocio.llm_proveedor, negocio.llm_modelo);
  const voz = `${nombreProveedorTts(negocio.tts_proveedor)} ${nombreVoz(negocio.tts_proveedor, negocio.voz_id)}`;

  const porMinutoLlm = MODELOS_LLM[negocio.llm_proveedor].find((m) => m.id === modelo)?.costoMinuto ?? null;
  const porHoraTts = PROVEEDORES_TTS.find((p) => p.valor === negocio.tts_proveedor)?.costoHora ?? null;
  const total =
    porMinutoLlm !== null && porHoraTts !== null ? porMinutoLlm + porHoraTts / 60 : null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border border-linea bg-panel px-4 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="etiqueta">Contesta con</span>
        <span className="text-[13px] font-medium text-tinta">
          {cerebro} · {voz}
        </span>
        {total !== null ? <Insignia>~${total.toFixed(3)} por minuto</Insignia> : null}
      </div>
      <Link href="/agente" className="text-[12px] text-acento hover:underline">
        Cambiar combinación
      </Link>
    </div>
  );
}
