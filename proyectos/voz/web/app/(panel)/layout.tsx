import Link from "next/link";
import { contexto } from "@/lib/sesion";
import { contadores, negocio } from "@/lib/consultas";
import { salir } from "@/lib/acciones";
import { AvanceListo } from "@/components/avance-listo";
import { BarraContenido } from "@/components/barra-contenido";
import { MarcaDimia } from "@/components/marca";
import { MenuLateral } from "@/components/menu-lateral";
import { ProveedorAvisos } from "@/components/kit";
import { PantallaCarga } from "@/components/pantalla-carga";
import { secciones } from "@/lib/giro";
import { avance } from "@/lib/listo";
import { telefono } from "@/lib/formato";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { membresias, negocioId, usuario, giro } = await contexto();
  const [actual, progreso, avisos] = await Promise.all([negocio(), avance(giro.herramientas), contadores()]);
  const membresia = membresias.find((m) => m.tenant_id === negocioId);
  const estadoLinea = !actual.telefono_entrada ? "sin" : actual.activo ? "activo" : "pausado";

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

        <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b border-linea bg-panel px-3 lg:hidden">
          {secciones(giro.herramientas).map((s) => (
            <Link key={s.href} href={s.href} className="px-2 py-3 text-[14px] font-medium whitespace-nowrap text-tinta-2">
              {s.nombre}
            </Link>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col">
          <BarraContenido
            email={usuario.email}
            telefono={actual.telefono_entrada ? telefono(actual.telefono_entrada) : null}
            estado={estadoLinea}
            herramientas={giro.herramientas}
          />
          <AvanceListo avance={progreso} />
          <main className="flex min-w-0 flex-1 flex-col px-6 py-6">{children}</main>
        </div>
      </div>
    </ProveedorAvisos>
  );
}
