import Link from "next/link";
import { Bell } from "lucide-react";
import { BuscadorGlobal, type DestinoPaleta } from "@/components/buscador-global";
import { contadores, negocio, reservasEntre } from "@/lib/consultas";
import { hora, isoDia, telefono } from "@/lib/formato";
import { secciones } from "@/lib/giro";
import { contexto } from "@/lib/sesion";

const ATAJO: Record<string, string> = { "/hoy": "G H", "/bandeja": "G M", "/clientes": "G C", "/agente": "G A" };

/** Buscar (⌘K) y el aviso de pendientes. */
export async function HerramientasGlobales() {
  const [{ giro }, avisos, config] = await Promise.all([contexto(), contadores(), negocio()]);
  const conAgenda = giro.herramientas.includes("agendar");
  const pendientes = avisos.bandeja + avisos.recados;

  const pantallas: DestinoPaleta[] = secciones(giro.herramientas).flatMap((s) =>
    s.pestanas.map((p, i) => ({
      id: p.href,
      texto: p.nombre,
      detalle: s.nombre === p.nombre ? s.detalle : s.nombre,
      href: p.href,
      atajo: i === 0 ? (ATAJO[s.href] ?? (s.nombre === "Dinero" ? "G D" : undefined)) : undefined,
      claves: s.nombre,
    })),
  );

  let citas: DestinoPaleta[] = [];
  if (conAgenda) {
    const hoy = isoDia(new Date(), config.zona_horaria);
    const lista = await reservasEntre(hoy, hoy);
    citas = lista
      .filter((r) => r.estado !== "cancelada")
      .map((r) => ({
        id: r.codigo,
        texto: r.cliente_nombre,
        detalle: `${r.codigo} · ${hora(r.inicio, config.zona_horaria)} · ${r.servicio}`,
        claves: `${r.telefono} ${telefono(r.telefono)}`,
        href: `/agenda?q=${encodeURIComponent(r.codigo)}`,
      }));
  }

  return (
    <>
      <BuscadorGlobal pantallas={pantallas} citas={citas} destinoBusqueda={conAgenda ? "/agenda" : undefined} />
      <Link
        href={avisos.bandeja > 0 || avisos.recados === 0 ? "/bandeja" : "/recados"}
        aria-label={pendientes > 0 ? `${pendientes} pendientes` : "Sin pendientes"}
        title={`${avisos.bandeja} sin leer · ${avisos.recados} recados`}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-linea bg-panel text-tinta-2 transition-colors duration-100 hover:bg-panel-2 hover:text-tinta focus-visible:border-acento focus-visible:outline-none"
      >
        <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
        {pendientes > 0 ? (
          <span className="numeros absolute -top-1.5 -right-1.5 min-w-4 rounded-md bg-acento px-1 text-center text-[10px] leading-4 font-bold text-acento-tinta">
            {pendientes}
          </span>
        ) : null}
      </Link>
    </>
  );
}
