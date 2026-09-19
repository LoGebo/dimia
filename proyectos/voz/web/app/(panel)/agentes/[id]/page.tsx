import Link from "next/link";
import { notFound } from "next/navigation";
import { AbrirChat } from "@/components/abrir-chat";
import { ControlesAgente } from "@/components/controles-agente";
import { IconoAgente } from "@/components/icono-agente";
import { agente } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

const NOMBRE_PERMISO: Record<string, string> = {
  leer: "leer agenda, clientes y cobros", navegar: "navegar y leer sitios", anotar: "anotar en Clientes",
  escribir: "escribir por WhatsApp o correo", agendar: "agendar o mover citas", formularios: "llenar formularios",
};

/** Un agente de cerca: quién es, qué hace solo, y el botón para hablarle. */
export default async function AgentePage({ params }: { params: Promise<{ id: string }> }) {
  await exigirSeccion("/agentes");
  const { id } = await params;
  const recepcion = id === "recepcion";
  const a = recepcion ? null : await agente(id);
  if (!recepcion && !a) notFound();
  const nombre = recepcion ? "Recepción" : a!.nombre;
  const trabajo = recepcion ? "Contesta teléfono, WhatsApp e Instagram. Agenda, cambia y cancela citas." : a!.trabajo;

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-14 text-center">
      <Link href="/agentes" className="self-start text-[13px] text-tinta-3 hover:text-tinta">← Agentes</Link>
      <IconoAgente nombre={nombre} tamano={72} />
      <div>
        <h1 className="text-[24px] font-semibold text-tinta">{nombre}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-tinta-2">{trabajo}</p>
      </div>
      <AbrirChat agente={recepcion ? "recepcion" : a!.id} nombre={nombre} />
      {recepcion ? (
        <Link href="/bandeja" className="text-[13px] text-acento hover:underline">Ver lo que ha contestado</Link>
      ) : (
        <>
          <p className="text-[12.5px] text-tinta-3">Hace solo: {a!.permisos.map((p) => NOMBRE_PERMISO[p] ?? p).join(" · ")}. Lo demás lo pregunta.</p>
          {a!.reglas ? <p className="max-w-md text-[12.5px] leading-relaxed whitespace-pre-wrap text-tinta-3">{a!.reglas}</p> : null}
          <ControlesAgente id={a!.id} estado={a!.estado} />
        </>
      )}
    </div>
  );
}
