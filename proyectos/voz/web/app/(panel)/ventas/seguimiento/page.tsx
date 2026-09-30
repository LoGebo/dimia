import { Encabezado } from "@/components/encabezado";
import { ChatVendedora } from "@/components/ventas/chat-vendedora";
import { ExperimentoSeguimiento } from "@/components/ventas/experimento";
import { Seguimiento } from "@/components/ventas/seguimiento";
import { exigirSeccion } from "@/lib/sesion";
import { experimentoActivo, seguimiento } from "@/lib/ventas";

export const dynamic = "force-dynamic";

export default async function PaginaSeguimiento() {
  const giro = await exigirSeccion("/ventas/seguimiento");
  const [{ config, niveles }, experimento] = await Promise.all([seguimiento(), experimentoActivo()]);
  const base = config.nivel === "propio" && config.pasos ? config.pasos : niveles[config.nivel]?.[config.trato] ?? [];
  return (
    <>
      <Encabezado
        titulo="Seguimiento"
        descripcion="Cómo trabaja el agente a cada interesado: qué tanto insiste, a qué hora y cuándo le pasa la conversación a usted."
        giro={giro.nombre}
        principal={<ChatVendedora />}
      />
      <Seguimiento key={JSON.stringify(config)} inicial={config} niveles={niveles} />
      <div className="px-5 pb-8 xl:max-w-[calc(100%-460px)]"><ExperimentoSeguimiento experimento={experimento} base={base} /></div>
    </>
  );
}
