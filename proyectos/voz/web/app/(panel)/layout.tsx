import Link from "next/link";
import { contexto } from "@/lib/sesion";
import { negocio } from "@/lib/consultas";
import { salir } from "@/lib/acciones";
import { AvanceListo } from "@/components/avance-listo";
import { MarcaDimia } from "@/components/marca";
import { Navegacion } from "@/components/navegacion";
import { NombreNegocio } from "@/components/selector-negocio";
import { BotonTema } from "@/components/tema";
import { ProveedorAvisos } from "@/components/kit";
import { contadores } from "@/lib/consultas";
import { fechaLarga, isoDia, telefono } from "@/lib/formato";
import { secciones } from "@/lib/giro";
import { avance } from "@/lib/listo";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { membresias, negocioId, usuario, rol, giro } = await contexto();
  const [actual, progreso, avisos] = await Promise.all([negocio(), avance(giro.herramientas), contadores()]);
  const estadoLinea = !actual.telefono_entrada ? "sin" : actual.activo ? "activo" : "pausado";
  const hoy = isoDia(new Date(), actual.zona_horaria);

  return (
    <ProveedorAvisos>
      <div className="grid min-h-screen grid-cols-1 bg-panel lg:grid-cols-[248px_minmax(0,1fr)]">
        <aside className="hidden flex-col border-r border-linea bg-panel lg:sticky lg:top-0 lg:flex lg:h-screen">
          <MarcaDimia />
          <NombreNegocio
            membresia={membresias.find((m) => m.tenant_id === negocioId)}
            telefono={actual.telefono_entrada ? telefono(actual.telefono_entrada) : null}
            estado={estadoLinea}
            fecha={fechaLarga(`${hoy}T12:00:00Z`, "UTC")}
          />
          <div className="flex-1 overflow-y-auto py-2">
            <Navegacion
              herramientas={giro.herramientas}
              contadores={{ "/bandeja": avisos.bandeja + avisos.recados, "/hoy": avisos.pedidos }}
            />
          </div>
          <div className="border-t border-linea px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12px] text-tinta-2">{usuario.email}</p>
                <p className="mt-0.5 text-[11px] text-tinta-3">{rol === "owner" ? "Dueño" : "Equipo"}</p>
              </div>
              <BotonTema />
            </div>
            <form action={salir} className="mt-2">
              <button className="text-[11.5px] text-tinta-3 transition-colors duration-150 hover:text-tinta focus-visible:text-acento focus-visible:outline-none">
                Cerrar sesión
              </button>
            </form>
          </div>
        </aside>

        <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b border-linea px-3 lg:hidden">
          {secciones(giro.herramientas).map((s) => (
            <Link key={s.href} href={s.href} className="px-2 py-2.5 text-[13px] whitespace-nowrap text-tinta-2">
              {s.nombre}
            </Link>
          ))}
        </nav>

        <main className="flex min-w-0 flex-col">
          <AvanceListo avance={progreso} />
          {children}
        </main>
      </div>
    </ProveedorAvisos>
  );
}
