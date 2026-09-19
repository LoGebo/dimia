import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { TarjetaAgente } from "@/components/tarjeta-agente";
import { agentes } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

/** Los agentes del negocio, uno por tarea. Recepción es el que ya contesta. */
export default async function AgentesPage() {
  await exigirSeccion("/agentes");
  const lista = await agentes();

  return (
    <>
      <Encabezado titulo="Agentes" descripcion="Uno por tarea. Se les habla como a alguien del equipo." />
      <div className="grid gap-4 px-5 py-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <TarjetaAgente id="recepcion" nombre="Recepción" tarea="Contesta teléfono, WhatsApp e Instagram" activo />
        {lista.map((a) => (
          <TarjetaAgente key={a.id} id={a.id} nombre={a.nombre} tarea={a.trabajo} activo={a.estado === "activo"} />
        ))}
        <Link href="/agentes/nuevo" className="flex min-h-[168px] flex-col items-center justify-center gap-3 border border-dashed border-linea-fuerte text-tinta-2 transition-colors duration-150 hover:border-acento hover:text-acento">
          <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center border border-current text-[22px] leading-none">+</span>
          <span className="text-[13px] font-medium">Nuevo agente</span>
        </Link>
      </div>
    </>
  );
}
