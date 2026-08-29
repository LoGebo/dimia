import { contexto } from "@/lib/sesion";
import { AvanceListo } from "@/components/avance-listo";
import { BarraSuperior } from "@/components/barra-superior";
import { ProveedorAvisos } from "@/components/kit";
import { avance } from "@/lib/listo";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { giro } = await contexto();
  const progreso = await avance(giro.herramientas);

  return (
    <ProveedorAvisos>
      <div className="flex min-h-screen flex-col bg-panel">
        <BarraSuperior />
        <AvanceListo avance={progreso} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </ProveedorAvisos>
  );
}
