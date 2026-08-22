import { redirect } from "next/navigation";
import { AltaNegocio } from "@/components/alta-negocio";
import { Paso } from "@/components/paso";
import { Tarjeta } from "@/components/ui/primitivos";
import { usuarioActual } from "@/lib/auth";
import { plantillasPublicas } from "@/lib/plantillas";

export default async function AltaInicio() {
  if (!(await usuarioActual())) redirect("/entrar");
  const lista = await plantillasPublicas();
  return (
    <Paso
      titulo="Empecemos por el negocio"
      descripcion="Cuatro datos. El giro define el tono con el que contesta el agente y qué preguntas hace: a un restaurante le pregunta cuántas personas, a un consultorio si es primera vez."
    >
      <Tarjeta className="px-5 py-5">
        <AltaNegocio plantillas={lista} />
      </Tarjeta>
    </Paso>
  );
}
