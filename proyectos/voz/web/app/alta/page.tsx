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
      descripcion="Cuatro datos. El giro define qué sabe hacer el agente y qué te va a pedir después: agendar horarios, tomar pedidos con su total, o solo contestar y dejarte el recado."
    >
      <Tarjeta className="px-5 py-5">
        <AltaNegocio plantillas={lista} />
      </Tarjeta>
    </Paso>
  );
}
