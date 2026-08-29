"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, CircleHelp, Menu, X } from "lucide-react";
import { IconoDimia } from "@/components/marca";
import { MenuLateral } from "@/components/menu-lateral";
import { EstadoLinea } from "@/components/kit/lateral";
import type { Herramienta } from "@/lib/tipos";

/**
 * En pantallas chicas el menú se vuelve un cajón que entra por la izquierda
 * (300 ms) con el contenido oscurecido detrás. Arriba queda una barra con la
 * marca, la acción principal, ayuda, avisos y el botón de menú.
 */
export function CajonMenu({
  email,
  negocio,
  giro,
  telefono,
  estado,
  herramientas,
  contadores,
  pendientes,
  principal,
  salir,
}: {
  email: string;
  negocio: string;
  giro: string;
  telefono: string | null;
  estado: "activo" | "pausado" | "sin";
  herramientas: Herramienta[];
  contadores: Partial<Record<string, number>>;
  pendientes: number;
  principal: { href: string; texto: string };
  salir: () => Promise<void>;
}) {
  const [abierto, setAbierto] = useState(false);
  const ruta = usePathname();

  useEffect(() => {
    setAbierto(false);
  }, [ruta]);

  useEffect(() => {
    if (!abierto) return;
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("keydown", tecla);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <div className="lg:hidden">
      <div className="sticky top-0 z-30 flex h-[64px] items-center gap-2 border-b border-linea bg-panel-2 px-4">
        <Link href="/hoy" aria-label="Inicio" className="flex items-center text-tinta">
          <IconoDimia tamano={30} />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={principal.href}
            className="inline-flex h-10 items-center rounded-lg bg-acento px-4 text-[15px] font-semibold text-acento-tinta transition-[filter,transform] duration-100 hover:brightness-110 active:scale-[0.98]"
          >
            {principal.texto}
          </Link>
          <Link
            href="/probar"
            aria-label="Ayuda"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-tinta-2 transition-colors duration-100 hover:bg-linea"
          >
            <CircleHelp size={22} strokeWidth={1.75} aria-hidden="true" />
          </Link>
          <Link
            href="/bandeja"
            aria-label={pendientes > 0 ? `${pendientes} pendientes` : "Avisos"}
            className="relative flex h-10 w-10 items-center justify-center rounded-lg text-tinta-2 transition-colors duration-100 hover:bg-linea"
          >
            <Bell size={22} strokeWidth={1.75} aria-hidden="true" />
            {pendientes > 0 ? (
              <span className="numeros pop absolute top-0.5 right-0.5 min-w-4 rounded-md bg-acento px-1 text-center text-[10px] leading-4 font-bold text-acento-tinta">
                {pendientes}
              </span>
            ) : null}
          </Link>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            aria-label="Abrir el menú"
            aria-expanded={abierto}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-tinta transition-colors duration-100 hover:bg-linea"
          >
            <Menu size={26} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        aria-hidden={!abierto}
        onClick={() => setAbierto(false)}
        className={`fixed inset-0 z-40 bg-tinta/40 transition-opacity duration-300 ${abierto ? "opacity-100" : "pointer-events-none opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-label="Menú"
        aria-hidden={!abierto}
        className={`fixed top-0 bottom-0 left-0 z-50 flex w-[82vw] max-w-[320px] flex-col border-r border-linea bg-panel-2 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 border-b border-linea px-4 py-4">
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-linea text-[18px] font-bold text-tinta uppercase">
            {email.slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[20px] leading-tight font-extrabold text-tinta">{negocio}</p>
            <p className="mt-0.5 truncate text-[13px] text-tinta-3">{giro}</p>
          </div>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar el menú"
            className="flex h-10 w-10 flex-none items-center justify-center rounded-lg text-tinta-2 transition-colors duration-100 hover:bg-linea"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-linea px-4 py-2.5 text-[13px]">
          {telefono ? <span className="numeros font-semibold text-tinta">{telefono}</span> : <span className="text-tinta-3">Aún sin número</span>}
          <EstadoLinea estado={estado} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <MenuLateral herramientas={herramientas} contadores={contadores} salir={salir} />
        </div>
      </aside>
    </div>
  );
}
