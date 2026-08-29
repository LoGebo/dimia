import Link from "next/link";
import { BuscadorGlobal, type DestinoPaleta } from "@/components/buscador-global";
import { CuentaMenu } from "@/components/cuenta-menu";
import { IconoDimia } from "@/components/marca";
import { NavSuperior } from "@/components/nav-superior";
import { EstadoLinea } from "@/components/kit/lateral";
import { contadores, negocio, reservasEntre } from "@/lib/consultas";
import { fechaLarga, hora, isoDia, telefono } from "@/lib/formato";
import { secciones } from "@/lib/giro";
import { contexto } from "@/lib/sesion";

const ATAJO: Record<string, string> = { "/hoy": "G H", "/bandeja": "G M", "/clientes": "G C", "/agente": "G A" };

/**
 * La barra de arriba: marca, las cinco secciones y las herramientas globales.
 * Debajo, una línea de contexto con el negocio, la línea y la fecha.
 */
export async function BarraSuperior() {
  const [{ usuario, rol, giro, membresias, negocioId }, avisos, config] = await Promise.all([
    contexto(),
    contadores(),
    negocio(),
  ]);
  const membresia = membresias.find((m) => m.tenant_id === negocioId);
  const conAgenda = giro.herramientas.includes("agendar");
  const pendientes = avisos.bandeja + avisos.recados;
  const estadoLinea = !config.telefono_entrada ? "sin" : config.activo ? "activo" : "pausado";
  const hoy = isoDia(new Date(), config.zona_horaria);

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
    <div className="sticky top-0 z-30 bg-panel">
      <div className="flex h-[52px] items-stretch gap-4 border-b border-linea px-5">
        <Link href="/hoy" className="flex items-center gap-2.5 text-tinta focus-visible:text-acento focus-visible:outline-none">
          <IconoDimia tamano={20} />
          <span className="text-[14px] font-semibold tracking-tight">Dimia Línea</span>
        </Link>
        <div className="hidden flex-1 justify-center md:flex">
          <NavSuperior
            herramientas={giro.herramientas}
            contadores={{ "/bandeja": pendientes, "/hoy": avisos.pedidos }}
          />
        </div>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <BuscadorGlobal pantallas={pantallas} citas={citas} destinoBusqueda={conAgenda ? "/agenda" : undefined} />
          <Link
            href={avisos.bandeja > 0 || avisos.recados === 0 ? "/bandeja" : "/recados"}
            aria-label={pendientes > 0 ? `${pendientes} pendientes` : "Sin pendientes"}
            title={`${avisos.bandeja} sin leer · ${avisos.recados} recados`}
            className="relative flex h-8 w-8 items-center justify-center border border-linea text-tinta-3 transition-colors duration-150 hover:bg-panel-2 hover:text-tinta focus-visible:border-acento focus-visible:outline-none"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
              <path d="M4 11V7a4 4 0 0 1 8 0v4l1.5 1.5h-11L4 11Z" />
              <path d="M6.5 13.5a1.5 1.5 0 0 0 3 0" />
            </svg>
            {pendientes > 0 ? (
              <span className="numeros absolute -top-1.5 -right-1.5 min-w-4 bg-acento px-1 text-center font-mono text-[10px] leading-4 text-acento-tinta">
                {pendientes}
              </span>
            ) : null}
          </Link>
          <CuentaMenu email={usuario.email} rol={rol === "owner" ? "Dueño" : "Equipo"} />
        </div>
      </div>
      <div className="flex h-8 items-center gap-4 border-b border-linea bg-panel-2 px-5 text-[12px] text-tinta-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-tinta-2">{membresia?.nombre ?? config.nombre}</span>
          <span aria-hidden="true" className="h-1 w-1 bg-laton" />
          <span className="truncate">{membresia?.vertical_nombre ?? giro.nombre}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="numeros font-mono text-tinta-2">{config.telefono_entrada ? telefono(config.telefono_entrada) : "Sin línea"}</span>
          <EstadoLinea estado={estadoLinea} />
        </div>
        <span className="ml-auto hidden sm:inline">{fechaLarga(`${hoy}T12:00:00Z`, "UTC")}</span>
      </div>
      <nav aria-label="Secciones" className="flex gap-1 overflow-x-auto border-b border-linea px-3 md:hidden">
        {secciones(giro.herramientas).map((s) => (
          <Link key={s.href} href={s.href} className="px-2 py-2 text-[13px] whitespace-nowrap text-tinta-2">
            {s.nombre}
          </Link>
        ))}
      </nav>
    </div>
  );
}
