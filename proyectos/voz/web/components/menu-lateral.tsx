"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Clock,
  House,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessagesSquare,
  MessageSquareText,
  Package,
  PhoneCall,
  Receipt,
  Settings,
  ShoppingBag,
  UserRound,
  Users,
  Voicemail,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { secciones } from "@/lib/giro";
import type { Herramienta } from "@/lib/tipos";

const ICONO_SECCION: Record<string, LucideIcon> = {
  Hoy: House,
  Mensajes: MessageSquareText,
  Clientes: Users,
  Dinero: Wallet,
  Ajustes: Settings,
};

const ICONO_PANTALLA: Record<string, LucideIcon> = {
  "/hoy": LayoutDashboard,
  "/agenda": CalendarDays,
  "/pedidos": ShoppingBag,
  "/bandeja": MessagesSquare,
  "/recados": Voicemail,
  "/clientes": Users,
  "/campanas": Megaphone,
  "/cobros": Receipt,
  "/resumen": BarChart3,
  "/agente": Bot,
  "/horarios": Clock,
  "/servicios": Briefcase,
  "/equipo": UserRound,
  "/catalogo": Package,
  "/conocimiento": BookOpen,
  "/mensajes": BellRing,
  "/probar": PhoneCall,
};

/**
 * El menú: cinco secciones con ícono. Las que tienen varias pantallas se
 * abren y cierran al tocarlas, con un despliegue de 260 ms en ambos sentidos;
 * la sección de la pantalla actual empieza abierta. Cada pantalla lleva su
 * ícono y la actual va en azul.
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
  const activaDeRuta = lista.find((s) => s.pestanas.some((p) => ruta === p.href || ruta.startsWith(`${p.href}/`)))?.href;
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(activaDeRuta ? [activaDeRuta] : []));

  useEffect(() => {
    if (activaDeRuta) setAbiertas((prev) => (prev.has(activaDeRuta) ? prev : new Set([...prev, activaDeRuta])));
  }, [activaDeRuta]);

  function alternar(href: string) {
    setAbiertas((prev) => {
      const nx = new Set(prev);
      if (nx.has(href)) nx.delete(href);
      else nx.add(href);
      return nx;
    });
  }

  return (
    <nav aria-label="Secciones" className="escalonado flex flex-1 flex-col gap-1 px-3 py-3">
      {lista.map((s) => {
        const activa = s.href === activaDeRuta;
        const Icono = ICONO_SECCION[s.nombre] ?? House;
        const n = contadores[s.href] ?? 0;
        const conSub = s.pestanas.length > 1;
        const abierta = conSub && abiertas.has(s.href);
        const claseFila = `menu-item flex h-[44px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-[14px] transition-[background-color,color,border-radius] duration-200 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30 ${
          activa ? "font-bold text-tinta" : "font-medium text-tinta-2 hover:text-tinta"
        } ${activa || abierta ? "bg-linea" : "hover:bg-linea"} ${abierta ? "rounded-b-none" : ""}`;
        const contenido = (
          <>
            <Icono size={18} strokeWidth={1.75} className={activa ? "text-acento" : "text-tinta-2"} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{s.nombre}</span>
            {n > 0 ? (
              <span key={n} className="numeros pop min-w-5 rounded-md bg-acento px-1.5 text-center text-[11px] leading-5 font-semibold text-acento-tinta">
                {n > 99 ? "99" : n}
              </span>
            ) : null}
            {conSub ? (
              <ChevronDown
                size={16}
                strokeWidth={2}
                aria-hidden="true"
                className={`text-tinta-3 transition-transform duration-260 ease-[cubic-bezier(0.22,1,0.36,1)] ${abierta ? "rotate-180" : ""}`}
              />
            ) : null}
          </>
        );

        return (
          <div key={s.href} className={`rounded-lg transition-[background-color] duration-200 ${abierta ? "bg-panel" : ""}`}>
            {conSub ? (
              <button type="button" onClick={() => alternar(s.href)} aria-expanded={abierta} aria-controls={`sub-${s.nombre}`} className={claseFila}>
                {contenido}
              </button>
            ) : (
              <Link href={s.href} aria-current={activa ? "page" : undefined} className={claseFila}>
                {contenido}
              </Link>
            )}
            {conSub ? (
              <div
                id={`sub-${s.nombre}`}
                className="grid transition-[grid-template-rows,opacity] duration-260 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                style={{ gridTemplateRows: abierta ? "1fr" : "0fr", opacity: abierta ? 1 : 0 }}
                aria-hidden={!abierta}
              >
                <ul className={`overflow-hidden ${abierta ? "border-t border-linea" : ""} pl-3`}>
                  {s.pestanas.map((p) => {
                    const es = ruta === p.href || ruta.startsWith(`${p.href}/`);
                    const IconoP = ICONO_PANTALLA[p.href] ?? LayoutDashboard;
                    return (
                      <li key={p.href} className="first:mt-1 last:mb-1">
                        <Link
                          href={p.href}
                          tabIndex={abierta ? 0 : -1}
                          aria-current={es ? "page" : undefined}
                          className={`flex h-[40px] items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium transition-[color,background-color,transform] duration-150 hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/30 ${
                            es ? "text-acento" : "text-tinta-2 hover:text-tinta"
                          }`}
                        >
                          <IconoP size={18} strokeWidth={1.75} aria-hidden="true" className={es ? "text-acento" : "text-tinta-2"} />
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
