import { contexto } from "@/lib/sesion";
import { contadores, negocio } from "@/lib/consultas";
import { salir } from "@/lib/acciones";
import { Armazon } from "@/components/armazon";
import { MarcaDimia } from "@/components/marca";
import { AvanceListo } from "@/components/avance-listo";
import { Navegacion } from "@/components/navegacion";
import { NombreNegocio } from "@/components/selector-negocio";
import { BotonTema } from "@/components/tema";
import { ProveedorAvisos } from "@/components/kit";
import { SoloAbierto, SoloPlegado } from "@/components/kit/lateral";
import { telefono } from "@/lib/formato";
import { avance } from "@/lib/listo";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { membresias, negocioId, usuario, rol, giro } = await contexto();
  const [actual, progreso, avisos] = await Promise.all([negocio(), avance(giro.herramientas), contadores()]);
  const estadoLinea = !actual.telefono_entrada ? "sin" : actual.activo ? "activo" : "pausado";
  const iniciales = usuario.email.slice(0, 2);

  const menu = (
    <>
      <MarcaDimia />
      <NombreNegocio
        membresia={membresias.find((m) => m.tenant_id === negocioId)}
        telefono={actual.telefono_entrada ? telefono(actual.telefono_entrada) : null}
        estado={estadoLinea}
      />
      <div className="flex-1 overflow-y-auto py-3">
        <SoloAbierto>
          <p className="etiqueta px-6 pb-1.5">Secciones</p>
        </SoloAbierto>
        <Navegacion
          herramientas={giro.herramientas}
          contadores={{ "/bandeja": avisos.bandeja + avisos.recados, "/hoy": avisos.pedidos }}
        />
      </div>
      <SoloAbierto>
        <div className="border-t border-linea px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 flex-none items-center justify-center bg-tinta font-mono text-[10px] font-medium text-paper uppercase"
              >
                {iniciales}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[12px] text-tinta-2">{usuario.email}</p>
                <p className="etiqueta mt-0.5">{rol === "owner" ? "Dueño" : "Equipo"}</p>
              </div>
            </div>
            <BotonTema />
          </div>
          <form action={salir} className="mt-2.5">
            <button className="flex items-center gap-1.5 text-[11px] text-tinta-3 transition-colors duration-150 hover:text-tinta">
              <i aria-hidden="true" className="h-1 w-1 bg-current" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </SoloAbierto>
      <SoloPlegado>
        <div className="flex flex-col items-center gap-2 border-t border-linea py-3">
          <BotonTema />
          <form action={salir}>
            <button
              title={`Cerrar sesión (${usuario.email})`}
              aria-label="Cerrar sesión"
              className="flex h-7 w-7 items-center justify-center bg-tinta font-mono text-[10px] font-medium text-paper uppercase transition-opacity duration-150 hover:opacity-80"
            >
              {iniciales}
            </button>
          </form>
        </div>
      </SoloPlegado>
    </>
  );

  return (
    <ProveedorAvisos>
      <Armazon menu={menu}>
        <AvanceListo avance={progreso} />
        {children}
      </Armazon>
    </ProveedorAvisos>
  );
}
