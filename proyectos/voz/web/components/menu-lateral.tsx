"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LogOut, MessageSquareText, Settings, Users, Wallet, type LucideIcon } from "lucide-react";
import { secciones } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

const ICONOS: Record<string, LucideIcon> = {
  Hoy: House,
  Mensajes: MessageSquareText,
  Clientes: Users,
  Dinero: Wallet,
  Ajustes: Settings,
};

/**
 * El menú: cinco secciones con ícono. La activa se abre con un despliegue de
 * 260 ms y muestra sus pantallas indentadas; la actual va en azul con un punto
 * que aparece con un pop. Los íconos se acercan al pasar el puntero.
 */
export function MenuLateral({
  herramientas,
  contadores = {},
  salir,
}: {
  herramientas: Herramienta[];
  contadores?: Partial<Record<string, number>>;
  salir: () => Promise<void>;
}) {
  const ruta = usePathname();
  const lista = secciones(herramientas);

  return (
    <nav aria-label="Secciones" className="escalonado flex flex-1 flex-col gap-1 px-3 py-3">
      {lista.map((s) => {
        const activa = s.pestanas.some((p) => ruta === p.href || ruta.startsWith(`${p.href}/`));
        const Icono = ICONOS[s.nombre] ?? House;
        const n = contadores[s.href] ?? 0;
        const conSub = s.pestanas.length > 1;
        return (
          <div key={s.href} className={activa && conSub ? "rounded-lg bg-panel" : ""}>
            <Link
              href={s.href}
              aria-current={activa && !conSub ? "page" : undefined}
              className={`menu-item flex h-[44px] items-center gap-2.5 rounded-lg px-3 text-[14px] transition-[background-color,color,transform] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30 ${
                activa
                  ? `font-bold text-tinta ${conSub ? "rounded-b-none bg-linea" : "bg-linea"}`
                  : "font-medium text-tinta-2 hover:bg-linea hover:text-tinta"
              }`}
            >
              <Icono size={18} strokeWidth={1.75} className={activa ? "text-acento" : "text-tinta-2"} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
              {n > 0 ? (
                <span
                  key={n}
                  className="numeros pop min-w-5 rounded-md bg-acento px-1.5 text-center text-[11px] leading-5 font-semibold text-acento-tinta"
                >
                  {n > 99 ? "99" : n}
                </span>
              ) : null}
            </Link>
            {activa && conSub ? (
              <div className="despliega grid">
                <ul className="overflow-hidden border-t border-linea py-1 pl-5">
                  {s.pestanas.map((p, i) => {
                    const es = ruta === p.href || ruta.startsWith(`${p.href}/`);
                    return (
                      <li key={p.href} style={{ animationDelay: `${60 + i * 40}ms` }} className="aparece-derecha">
                        <Link
                          href={p.href}
                          aria-current={es ? "page" : undefined}
                          className={`flex h-[40px] items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium transition-[color,transform] duration-150 hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30 ${
                            es ? "text-acento" : "text-tinta-2 hover:text-tinta"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full transition-transform duration-200 ${es ? "pop bg-acento" : "bg-linea-fuerte"}`}
                          />
                          {p.nombre}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>
        );
      })}
      <form action={salir} className="mt-auto pt-2">
        <button
          type="submit"
          className="menu-item flex h-[44px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-[14px] font-medium text-tinta-2 transition-[background-color,color] duration-150 hover:bg-linea hover:text-tinta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30"
        >
          <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
          Cerrar sesión
        </button>
      </form>
    </nav>
  );
}
