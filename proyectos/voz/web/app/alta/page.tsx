import { redirect } from "next/navigation";
import { AltaNegocio } from "@/components/alta-negocio";
import { Paso } from "@/components/paso";
import { Tarjeta } from "@/components/ui/primitivos";
import { usuarioActual } from "@/lib/auth";
import { membresias } from "@/lib/sesion";
import { plantillasPublicas } from "@/lib/plantillas";

export default async function AltaInicio() {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  // Una cuenta atiende un negocio. Quien ya tiene el suyo no vuelve a darse de
  // alta: antes esto creaba un segundo negocio y aparecia el selector.
  if ((await membresias(usuario.id)).length > 0) redirect("/resumen");
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
