import { contexto } from "@/lib/sesion";
import { contadores, negocio } from "@/lib/consultas";
import { salir } from "@/lib/acciones";
import { Armazon } from "@/components/armazon";
import { MarcaDimia } from "@/components/marca";
import { AvanceListo } from "@/components/avance-listo";
import { Navegacion } from "@/components/navegacion";
import { NombreNegocio } from "@/components/selector-negocio";
import { BotonTema } from "@/components/tema";
import { telefono } from "@/lib/formato";
import { avance } from "@/lib/listo";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { membresias, negocioId, usuario, rol, giro } = await contexto();
  const [actual, progreso, avisos] = await Promise.all([negocio(), avance(giro.herramientas), contadores()]);

  const menu = (
    <>
      <MarcaDimia />
      <NombreNegocio membresia={membresias.find((m) => m.tenant_id === negocioId)} />
      <div className="mx-5 my-3 flex items-center justify-between gap-2 bg-pozo px-3 py-2.5">
        <div className="min-w-0">
          <p className="etiqueta">Línea</p>
          <p className="numeros mt-0.5 truncate font-mono text-[12px] text-tinta">
            {actual.telefono_entrada ? telefono(actual.telefono_entrada) : "sin asignar"}
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 font-mono text-[10px] tracking-[0.18em] uppercase ${
            !actual.telefono_entrada ? "text-tinta-3" : actual.activo ? "text-bueno" : "text-alerta"
          }`}
        >
          <i aria-hidden="true" className={`h-1.5 w-1.5 bg-current ${actual.activo && actual.telefono_entrada ? "late" : ""}`} />
          {!actual.telefono_entrada ? "Sin línea" : actual.activo ? "Activo" : "Pausado"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        <Navegacion
          herramientas={giro.herramientas}
          contadores={{ "/bandeja": avisos.bandeja, "/pedidos": avisos.pedidos, "/recados": avisos.recados }}
        />
      </div>
      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12px] text-tinta-2">{usuario.email}</p>
            <p className="text-[11px] text-tinta-3">{rol === "owner" ? "Dueño" : "Equipo"}</p>
          </div>
          <BotonTema />
        </div>
        <form action={salir} className="mt-2">
          <button className="text-[11px] text-tinta-3 transition hover:text-tinta">Cerrar sesión</button>
        </form>
      </div>
    </>
  );

  return (
    <Armazon menu={menu}>
      <AvanceListo avance={progreso} />
      {children}
    </Armazon>
  );
}
