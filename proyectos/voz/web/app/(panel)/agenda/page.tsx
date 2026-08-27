import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { FlujoDelDia } from "@/components/flujo-del-dia";
import { ListaReservas } from "@/components/lista-reservas";
import { NuevaCita } from "@/components/nueva-cita";
import { OcupacionSemanal } from "@/components/graficas";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { buscarReservas, negocio, reservasEntre, servicios } from "@/lib/consultas";
import { fechaLarga, isoDia, lunesDe, sumarDias } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { DIAS } from "@/lib/tipos";

type Vista = "dia" | "semana";

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; vista?: string; q?: string; recurso?: string; filtro?: string; orden?: string }>;
}) {
  const giro = await exigirSeccion("/agenda");
  const parametros = await searchParams;
  const config = await negocio();
  const hoy = isoDia(new Date(), config.zona_horaria);
  const dia = parametros.dia ?? hoy;
  const vista: Vista = parametros.vista === "semana" ? "semana" : "dia";
  const busqueda = parametros.q?.trim() ?? "";

  if (busqueda) {
    const encontradas = await buscarReservas(busqueda);
    return (
      <>
        <Encabezado
          titulo="Búsqueda"
          descripcion={`Resultados para "${busqueda}"`}
          giro={giro.nombre}
          busqueda={busqueda}
          acciones={
            <Link href="/agenda" className="text-[12px] text-tinta-3 transition hover:text-acento">
              Volver al día
            </Link>
          }
        />
        <div className="px-5 py-5">
          <Tarjeta>
            <TarjetaCabecera titulo={`${encontradas.length} reservas`} descripcion="Por código, teléfono o nombre." />
            {encontradas.length === 0 ? (
              <Vacio
                titulo="Sin coincidencias"
                detalle="Busca por el código de cuatro letras que dictó el agente, por el teléfono desde el que llamaron, o por el nombre."
              />
            ) : (
              <ListaReservas reservas={encontradas} zona={config.zona_horaria} mostrarFecha />
            )}
          </Tarjeta>
        </div>
      </>
    );
  }

  const lunes = lunesDe(dia);
  const rangoInicio = vista === "dia" ? dia : lunes;
  const rangoFin = vista === "dia" ? dia : sumarDias(lunes, 6);
  const [reservas, listaServicios] = await Promise.all([reservasEntre(rangoInicio, rangoFin), servicios()]);

  const enDia = (objetivo: string) =>
    reservas.filter((r) => isoDia(new Date(r.inicio), config.zona_horaria) === objetivo);

  const enlace = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | undefined> = {
      dia,
      vista,
      recurso: parametros.recurso,
      filtro: parametros.filtro,
      orden: parametros.orden,
      ...cambios,
    };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `/agenda?${p.toString()}`;
  };

  const navegacion = (
    <>
      <div className="flex border border-linea bg-panel">
        {(["dia", "semana"] as const).map((v) => (
          <Link
            key={v}
            href={enlace({ vista: v })}
            className={`px-2.5 py-1.5 text-[12px] transition ${
              v === vista ? "bg-tinta font-medium text-paper" : "text-tinta-2 hover:bg-panel-2"
            }`}
          >
            {v === "dia" ? "Día" : "Semana"}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-1">
        <Navegar destino={enlace({ dia: sumarDias(dia, vista === "dia" ? -1 : -7) })} etiqueta="‹" />
        <Link
          href={enlace({ dia: hoy })}
          className="h-8 border border-linea bg-panel px-2.5 text-[12px] leading-[30px] text-tinta-2 transition hover:bg-panel-2"
        >
          Hoy
        </Link>
        <Navegar destino={enlace({ dia: sumarDias(dia, vista === "dia" ? 1 : 7) })} etiqueta="›" />
      </div>
    </>
  );

  const nueva = <NuevaCita servicios={listaServicios.filter((s) => s.activo)} dia={dia} zona={config.zona_horaria} />;

  if (vista === "semana") {
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
    const conteos = dias.map((d) => enDia(d).filter((r) => r.estado === "confirmada").length);
    return (
      <>
        <Encabezado titulo="Agenda" descripcion={`Semana del ${lunes}`} giro={giro.nombre} acciones={navegacion} principal={nueva} />
        <div className="space-y-4 px-5 py-5">
          <OcupacionSemanal conteos={conteos} />
          {dias.map((d, i) => {
            const delDia = enDia(d);
            return (
              <Tarjeta key={d}>
                <TarjetaCabecera
                  titulo={`${DIAS[i]} ${d.slice(8)}`}
                  descripcion={`${delDia.filter((r) => r.estado === "confirmada").length} confirmadas`}
                  accion={
                    <Link href={enlace({ dia: d, vista: "dia" })} className="text-xs text-tinta-3 transition hover:text-acento">
                      Ver día
                    </Link>
                  }
                />
                {delDia.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-tinta-3">Sin reservas.</p>
                ) : (
                  <ListaReservas reservas={delDia} zona={config.zona_horaria} />
                )}
              </Tarjeta>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <>
      <Encabezado
        titulo="Agenda"
        descripcion={`${fechaLarga(`${dia}T12:00:00Z`, "UTC")} · marca Llegó cuando entre cada persona y Atendida al terminar.`}
        giro={giro.nombre}
        acciones={navegacion}
        principal={nueva}
      />
      <div className="space-y-4 px-5 py-5">
        <FlujoDelDia dia={dia} base="/agenda" parametros={parametros} giro={giro} extra={{ dia, vista }} />
      </div>
    </>
  );
}

function Navegar({ destino, etiqueta }: { destino: string; etiqueta: string }) {
  return (
    <Link
      href={destino}
      className="flex h-8 w-8 items-center justify-center border border-linea bg-panel text-tinta-2 transition hover:bg-panel-2"
    >
      {etiqueta}
    </Link>
  );
}
