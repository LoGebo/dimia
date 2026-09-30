import { Encabezado } from "@/components/encabezado";
import { ChatVendedora } from "@/components/ventas/chat-vendedora";
import { Interesados } from "@/components/ventas/interesados";
import { exigirSeccion } from "@/lib/sesion";
import { interesados, seguimiento } from "@/lib/ventas";

export const dynamic = "force-dynamic";

export default async function Ventas() {
  const giro = await exigirSeccion("/ventas");
  const [{ lista, resumen }, { config }] = await Promise.all([interesados(), seguimiento()]);
  return (
    <>
      <Encabezado
        titulo="Interesados"
        descripcion="Su agente de ventas contesta a cada persona en segundos y le da seguimiento hasta agendar. Aquí ve qué hace y en qué lo necesita."
        giro={giro.nombre}
        principal={<ChatVendedora />}
      />
      <Interesados lista={lista} resumen={resumen} activo={config.activo} />
    </>
  );
}
