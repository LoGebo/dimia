import { AppAgentes } from "@/components/app-agentes";
import { agentes, gruposAgentes, negocio } from "@/lib/consultas";
import { exigirSeccion } from "@/lib/sesion";

/**
 * Agentes es una app dentro del panel, como iMessage: lista a la izquierda,
 * el hilo del agente al centro, su pantalla a la derecha. Se sale del
 * padding del panel para ocupar todo. Toda la información de los agentes se
 * carga aquí una vez; cambiar de agente es solo cliente.
 */
export default async function AgentesLayout({ children }: { children: React.ReactNode }) {
  await exigirSeccion("/agentes");
  const [lista, grupos, config] = await Promise.all([agentes(), gruposAgentes(), negocio()]);
  return (
    <div className="agentes -mx-4 -my-4 flex h-[calc(100vh-70px)] flex-none overflow-hidden sm:-mx-6 sm:-my-6">
      <AppAgentes
        agentes={lista.map((a) => ({ id: a.id, nombre: a.nombre, trabajo: a.trabajo, avatar: a.avatar, activo: a.estado === "activo", permisos: a.permisos, rol: a.rol, reglas: a.reglas, personalidad: a.personalidad, ajustes: a.ajustes ?? {} }))}
        grupos={grupos.map((g) => ({ id: g.id, nombre: g.nombre, miembros: g.miembros }))}
        negocio={config.nombre}
      >
        {children}
      </AppAgentes>
    </div>
  );
}
