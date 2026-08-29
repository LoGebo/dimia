import { redirect } from "next/navigation";
import { AltaNegocio } from "@/components/alta-negocio";
import { Tarjeta } from "@/components/ui/primitivos";
import { usuarioActual } from "@/lib/auth";
import { membresias } from "@/lib/sesion";
import { plantillasPublicas } from "@/lib/plantillas";

export default async function AltaInicio() {
  const usuario = await usuarioActual();
  if (!usuario) redirect("/entrar");
  // Una cuenta atiende un negocio. Quien ya tiene el suyo no vuelve a darse de
  // alta: antes esto creaba un segundo negocio y aparecia el selector.
  if ((await membresias(usuario.id)).length > 0) redirect("/hoy");
  const lista = await plantillasPublicas();
  return (
    <div className="kit-revela space-y-5">
      <div>
        <p className="etiqueta text-laton">Paso 1 de 1</p>
        <h1 className="mt-2 flex items-baseline gap-1.5 font-display text-[28px] leading-none font-light tracking-[-0.012em] text-tinta">
          Empecemos por el negocio
          <i className="cuadrado" aria-hidden="true" />
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-tinta-2">
          Cuatro datos. El giro define qué sabe hacer el agente y qué te va a pedir después: agendar horarios, tomar
          pedidos con su total, o solo contestar y dejarte el recado.
        </p>
      </div>
      <Tarjeta className="px-5 py-5">
        <AltaNegocio plantillas={lista} />
      </Tarjeta>
    </div>
  );
}
