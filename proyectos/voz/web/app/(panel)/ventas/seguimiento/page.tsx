import { Encabezado } from "@/components/encabezado";
import { Prototipo } from "@/components/ventas/prototipo";
import { Seguimiento } from "@/components/ventas/seguimiento";
import { exigirSeccion } from "@/lib/sesion";

export default async function PaginaSeguimiento() {
  const giro = await exigirSeccion("/ventas/seguimiento");
  return (
    <>
      <Encabezado
        titulo="Seguimiento"
        descripcion="Cómo trabaja el agente a cada interesado: qué tanto insiste, por dónde, a qué hora y cuándo le pasa la conversación a usted."
        giro={giro.nombre}
      />
      <Prototipo />
      <Seguimiento />
    </>
  );
}
