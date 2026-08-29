import { contexto } from "@/lib/sesion";
import { contadores, negocio } from "@/lib/consultas";
import { salir } from "@/lib/acciones";
import { AvanceListo } from "@/components/avance-listo";
import { BarraContenido } from "@/components/barra-contenido";
import { MarcaDimia } from "@/components/marca";
import { MenuLateral } from "@/components/menu-lateral";
import { ProveedorAvisos } from "@/components/kit";
import { PantallaCarga } from "@/components/pantalla-carga";
import { ChatAgente } from "@/components/chat-agente";
import { CajonMenu } from "@/components/cajon-menu";
import { avance } from "@/lib/listo";
import { telefono } from "@/lib/formato";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { membresias, negocioId, usuario, giro } = await contexto();
  const [actual, progreso, avisos] = await Promise.all([negocio(), avance(giro.herramientas), contadores()]);
  const membresia = membresias.find((m) => m.tenant_id === negocioId);
  const estadoLinea = !actual.telefono_entrada ? "sin" : actual.activo ? "activo" : "pausado";
  const principal = giro.herramientas.includes("agendar")
    ? { href: "/agenda?nueva=1", texto: "Nueva cita" }
    : giro.herramientas.includes("pedido")
      ? { href: "/pedidos", texto: "Ver pedidos" }
      : { href: "/bandeja", texto: "Ver mensajes" };

  return (
    <ProveedorAvisos>
      <PantallaCarga />
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden flex-col border-r border-linea bg-panel-2 lg:sticky lg:top-0 lg:flex lg:h-screen">
          <MarcaDimia />
          <div className="border-b border-linea px-5 py-3">
            <p className="truncate text-[13.5px] font-bold text-tinta">{membresia?.nombre ?? actual.nombre}</p>
            <p className="mt-0.5 truncate text-[12px] text-tinta-3">{membresia?.vertical_nombre ?? giro.nombre}</p>
          </div>
          <MenuLateral
            herramientas={giro.herramientas}
            contadores={{ "/bandeja": avisos.bandeja + avisos.recados, "/hoy": avisos.pedidos }}
            salir={salir}
          />
        </aside>

        <div className="flex min-w-0 flex-col">
          <CajonMenu
            email={usuario.email}
            negocio={membresia?.nombre ?? actual.nombre}
            giro={membresia?.vertical_nombre ?? giro.nombre}
            telefono={actual.telefono_entrada ? telefono(actual.telefono_entrada) : null}
            estado={estadoLinea}
            herramientas={giro.herramientas}
            contadores={{ "/bandeja": avisos.bandeja + avisos.recados, "/hoy": avisos.pedidos }}
            pendientes={avisos.bandeja + avisos.recados}
            principal={principal}
            salir={salir}
          />

          <BarraContenido
            email={usuario.email}
            telefono={actual.telefono_entrada ? telefono(actual.telefono_entrada) : null}
            estado={estadoLinea}
            herramientas={giro.herramientas}
          />
          <AvanceListo avance={progreso} />
          <main className="flex min-w-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
      <ChatAgente negocio={membresia?.nombre ?? actual.nombre} />
    </ProveedorAvisos>
  );
}
