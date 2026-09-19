import { notFound } from "next/navigation";
import { PantallaAgente } from "@/components/pantalla-agente";
import { agente, negocio } from "@/lib/consultas";

export default async function AgentePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [config, a] = await Promise.all([negocio(), id === "recepcion" ? null : agente(id)]);
  if (id !== "recepcion" && !a) notFound();
  const datos = id === "recepcion"
    ? { id: "recepcion", nombre: "Recepción", trabajo: "Contesta teléfono, WhatsApp e Instagram. Agenda, cambia y cancela citas.", avatar: null, activo: true }
    : { id: a!.id, nombre: a!.nombre, trabajo: a!.trabajo, avatar: a!.avatar, activo: a!.estado === "activo" };
  return <PantallaAgente agente={datos} negocio={config.nombre} permisos={a?.permisos ?? []} />;
}
