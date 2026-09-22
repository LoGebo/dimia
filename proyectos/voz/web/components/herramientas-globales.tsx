import { CampanaAvisos } from "@/components/campana-avisos";
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
      <CampanaAvisos pendientes={pendientes} />
    </>
  );
}
