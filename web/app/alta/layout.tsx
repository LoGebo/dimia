import Link from "next/link";
import { BotonTema } from "@/components/tema";
import { Pasos } from "@/components/pasos";
import { HERRAMIENTAS_POR_DEFECTO, pasosAlta } from "@/lib/giro";
import { giroOpcional } from "@/lib/sesion";

export default async function AltaLayout({ children }: { children: React.ReactNode }) {
  const giro = await giroOpcional();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-linea bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-acento text-[11px] font-bold text-acento-tinta">
              A
            </span>
            <span className="text-[13px] font-semibold tracking-tight text-tinta">Alta de negocio</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/resumen" className="text-[11px] text-tinta-3 transition hover:text-tinta">
              Salir al panel
            </Link>
            <BotonTema />
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-6 pb-3">
          <Pasos pasos={pasosAlta(giro?.herramientas ?? HERRAMIENTAS_POR_DEFECTO)} />
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
