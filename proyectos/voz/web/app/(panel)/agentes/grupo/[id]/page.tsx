import { notFound } from "next/navigation";
import { HiloGrupo } from "@/components/hilo-grupo";
import { RECEPCION } from "@/components/roster-agentes";
import { agentes, grupoAgentes, negocio } from "@/lib/consultas";

export default async function GrupoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [g, lista, config] = await Promise.all([grupoAgentes(id), agentes(), negocio()]);
  if (!g) notFound();
  const todos = [RECEPCION, ...lista.map((a) => ({ id: a.id, nombre: a.nombre, trabajo: a.trabajo, avatar: a.avatar, activo: a.estado === "activo" }))];
  return <HiloGrupo grupo={g} agentes={todos} negocio={config.nombre} />;
}
