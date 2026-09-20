import { RosterAgentes } from "@/components/roster-agentes";
import { agentes, gruposAgentes } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

/**
 * Agentes es una app dentro del panel, como iMessage: lista a la izquierda,
 * el hilo del agente al centro, su pantalla a la derecha. Se sale del
 * padding del panel para ocupar todo.
 */
export default async function AgentesLayout({ children }: { children: React.ReactNode }) {
  await exigirSeccion("/agentes");
  const [lista, grupos] = await Promise.all([agentes(), gruposAgentes()]);
  return (
    <div className="agentes -mx-4 -my-4 flex h-[calc(100vh-70px)] flex-none overflow-hidden sm:-mx-6 sm:-my-6">
      <RosterAgentes agentes={lista.map((a) => ({ id: a.id, nombre: a.nombre, trabajo: a.trabajo, avatar: a.avatar, activo: a.estado === "activo" }))} grupos={grupos.map((g) => ({ id: g.id, nombre: g.nombre, miembros: g.miembros }))} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
