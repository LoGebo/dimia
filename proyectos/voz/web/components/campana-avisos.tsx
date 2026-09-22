"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { avisos, marcarAvisosLeidos, type Aviso } from "@/lib/acciones";

const PUNTO: Record<string, string> = {
  "whatsapp.fallido": "bg-critico", "cita.cancelada": "bg-critico", "cita.no_asistio": "bg-critico",
  "cita.creada": "bg-acento", "cita.confirmada_cliente": "bg-bueno", "pago.registrado": "bg-bueno",
};

function hace(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(new Date(iso));
}

/**
 * La campana: lo que el dueño debe saber (citas nuevas o canceladas, confirmaciones, recados,
 * pagos, WhatsApp que no se entregaron) más lo pendiente de la bandeja. Se revisa cada 20 s.
 */
export function CampanaAvisos({ pendientes }: { pendientes: number }) {
  const [abierto, setAbierto] = useState(false);
  const [datos, setDatos] = useState<{ lista: Aviso[]; sinLeer: number }>({ lista: [], sinLeer: 0 });
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    const leer = () => void avisos().then((d) => { if (vivo) setDatos(d); }).catch(() => {});
    leer();
    const t = setInterval(leer, 20000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) { if (!caja.current?.contains(e.target as Node)) setAbierto(false); }
    function tecla(e: KeyboardEvent) { if (e.key === "Escape") setAbierto(false); }
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", tecla); };
  }, [abierto]);

  function abrir() {
    setAbierto((v) => !v);
    const ultimo = datos.lista[0];
    if (!abierto && ultimo && datos.sinLeer > 0) {
      void marcarAvisosLeidos(ultimo.id);
      setTimeout(() => setDatos((d) => ({ lista: d.lista.map((a) => ({ ...a, leido: true })), sinLeer: 0 })), 1500);
    }
  }

  const total = datos.sinLeer + pendientes;
  return (
    <div ref={caja} className="relative">
      <button type="button" onClick={abrir} aria-expanded={abierto} aria-label={total > 0 ? `${total} avisos` : "Avisos"} className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-linea bg-panel text-tinta-2 transition-colors duration-100 hover:bg-panel-2 hover:text-tinta focus-visible:border-acento focus-visible:outline-none">
        <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        {total > 0 ? <span className="numeros pop absolute -top-1.5 -right-1.5 min-w-4 rounded-md bg-acento px-1 text-center text-[10px] leading-4 font-bold text-acento-tinta">{total > 99 ? "99+" : total}</span> : null}
      </button>
      {abierto ? (
        <div className="absolute top-11 right-0 z-40 w-[360px] max-w-[calc(100vw-24px)] rounded-2xl border border-linea bg-panel shadow-[0_8px_24px_rgba(11,15,23,0.12)]">
          <div className="flex items-center justify-between border-b border-linea px-4 py-3">
            <p className="text-[14px] font-semibold text-tinta">Avisos</p>
            {pendientes > 0 ? <Link href="/bandeja" onClick={() => setAbierto(false)} className="text-[12.5px] text-acento hover:underline">{pendientes} pendientes en bandeja y recados</Link> : null}
          </div>
          <ul className="max-h-[420px] overflow-y-auto py-1">
            {datos.lista.length ? datos.lista.map((a) => (
              <li key={a.id}>
                <Link href={a.enlace ?? "#"} onClick={() => setAbierto(false)} className="flex gap-3 px-4 py-2.5 transition-colors duration-100 hover:bg-linea/50">
                  <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${PUNTO[a.tipo] ?? "bg-tinta-3"} ${a.leido ? "opacity-40" : ""}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[13.5px] ${a.leido ? "text-tinta-2" : "font-semibold text-tinta"}`}>{a.titulo}</span>
                      <span className="numeros flex-none text-[11px] text-tinta-3">{hace(a.creado)}</span>
                    </span>
                    <span className="block text-[12.5px] leading-snug text-tinta-3">{a.cuerpo}</span>
                  </span>
                </Link>
              </li>
            )) : <li className="px-4 py-8 text-center text-[13px] text-tinta-3">Sin avisos todavía.</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
