import Link from "next/link";
import { BotonTema } from "@/components/tema";

export default function AccesoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden flex-col justify-between border-r border-linea bg-panel px-12 py-10 lg:flex">
        <div className="rejilla-fondo pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative">
          <Marca />
        </div>
        <div className="relative max-w-md">
          <h1 className="text-[28px] leading-[1.15] font-semibold tracking-tight text-tinta">
            Tu teléfono contestado, agendado y medido.
          </h1>
          <p className="mt-4 text-[13px] leading-relaxed text-tinta-2">
            El agente contesta cada llamada, consulta disponibilidad real y reserva en el momento.
            Aquí controlas qué ofrece, a qué horas y con qué recursos.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-linea bg-linea">
            {[
              ["< 15 min", "para dar de alta"],
              ["0", "dobles reservas"],
              ["24/7", "sin buzón"],
            ].map(([valor, texto]) => (
              <div key={texto} className="bg-panel px-3 py-3">
                <dt className="numeros text-[17px] font-semibold text-tinta">{valor}</dt>
                <dd className="mt-0.5 text-[11px] text-tinta-3">{texto}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="relative text-[11px] text-tinta-3">
          La garantía de no traslape vive en la base de datos, no en el código.
        </p>
      </aside>
      <main className="flex flex-col">
        <header className="flex items-center justify-between px-6 py-5 lg:justify-end">
          <span className="lg:hidden">
            <Marca />
          </span>
          <BotonTema />
        </header>
        <div className="flex flex-1 items-center justify-center px-6 pb-16">
          <div className="w-full max-w-[340px]">{children}</div>
        </div>
      </main>
    </div>
  );
}

function Marca() {
  return (
    <Link href="/" className="inline-flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded bg-acento text-[11px] font-bold text-acento-tinta">
        A
      </span>
      <span className="text-[13px] font-semibold tracking-tight text-tinta">Agenda por voz</span>
    </Link>
  );
}
