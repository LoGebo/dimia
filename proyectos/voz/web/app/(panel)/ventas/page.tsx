import { Encabezado } from "@/components/encabezado";
import { Interesados } from "@/components/ventas/interesados";
import { Prototipo } from "@/components/ventas/prototipo";
import { exigirSeccion } from "@/lib/sesion";

export default async function Ventas() {
  const giro = await exigirSeccion("/ventas");
  return (
    <>
      <Encabezado
        titulo="Interesados"
        descripcion="Su agente de ventas contesta a cada persona en segundos y le da seguimiento hasta agendar. Aquí ve qué hace y en qué lo necesita."
        giro={giro.nombre}
      />
      <Prototipo />
      <Interesados />
    </>
  );
}
