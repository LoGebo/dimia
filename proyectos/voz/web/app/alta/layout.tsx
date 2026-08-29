import { IconoDimia } from "@/components/marca";
import { BotonTema } from "@/components/tema";

export default function AltaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-linea bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2.5 text-tinta">
            <IconoDimia tamano={20} />
            <div className="leading-tight">
              <p className="text-[13px] font-semibold tracking-tight">Dimia Panel</p>
              <p className="etiqueta mt-0.5">Alta de negocio</p>
            </div>
          </div>
          <BotonTema />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
