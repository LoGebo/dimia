import Link from "next/link";
import { contexto } from "@/lib/sesion";
import { negocio } from "@/lib/consultas";
import { salir } from "@/lib/acciones";
import { MarcaDimia } from "@/components/marca";
import { Navegacion } from "@/components/navegacion";
import { SelectorNegocio } from "@/components/selector-negocio";
import { BotonTema } from "@/components/tema";
import { Insignia } from "@/components/ui/primitivos";
import { telefono } from "@/lib/formato";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { membresias, negocioId, usuario, rol, giro } = await contexto();
  const actual = await negocio();

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[232px_1fr]">
      <aside className="flex flex-col border-r border-linea bg-panel lg:sticky lg:top-0 lg:h-screen">
        <MarcaDimia />
        <div className="border-b border-linea">
          <SelectorNegocio membresias={membresias} activo={negocioId} />
        </div>
        <div className="border-b border-linea px-3 py-2.5">
          <p className="etiqueta">Número de entrada</p>
          <p className="numeros mt-1 text-[13px] text-tinta">
            {actual.telefono_entrada ? telefono(actual.telefono_entrada) : "sin asignar"}
          </p>
          <div className="mt-1.5">
            {actual.activo ? <Insignia tono="bueno">Activo</Insignia> : <Insignia tono="alerta">Pausado</Insignia>}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-3">
          <Navegacion herramientas={giro.herramientas} />
        </div>
        <div className="border-t border-linea px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] text-tinta-2">{usuario.email}</p>
              <p className="text-[11px] text-tinta-3">{rol === "owner" ? "Dueño" : "Equipo"}</p>
            </div>
            <BotonTema />
          </div>
          <div className="flex items-center gap-2">
            <form action={salir}>
              <button className="text-[11px] text-tinta-3 transition hover:text-tinta">Cerrar sesión</button>
            </form>
            <span className="text-tinta-3">·</span>
            <Link href="/alta" className="text-[11px] text-tinta-3 transition hover:text-tinta">
              Nuevo negocio
            </Link>
          </div>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
