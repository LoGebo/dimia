import { Encabezado } from "@/components/encabezado";
import { Seguimiento } from "@/components/ventas/seguimiento";
import { exigirSeccion } from "@/lib/sesion";
import { seguimiento } from "@/lib/ventas";

export const dynamic = "force-dynamic";

export default async function PaginaSeguimiento() {
  const giro = await exigirSeccion("/ventas/seguimiento");
  const { config, niveles } = await seguimiento();
  return (
    <>
      <Encabezado
        titulo="Seguimiento"
        descripcion="Cómo trabaja el agente a cada interesado: qué tanto insiste, a qué hora y cuándo le pasa la conversación a usted."
        giro={giro.nombre}
      />
      <Seguimiento inicial={config} niveles={niveles} />
    </>
  );
}
