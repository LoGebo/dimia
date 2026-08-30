import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { FlujoDelDia } from "@/components/flujo-del-dia";
import { ListaReservas } from "@/components/lista-reservas";
import { NavegarDia } from "@/components/navegar-dia";
import { NuevaCita } from "@/components/nueva-cita";
import { OcupacionSemanal } from "@/components/graficas";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { buscarReservas, negocio, proximasReservas, reservasEntre, servicios } from "@/lib/consultas";
import { diaValido, fechaLarga, isoDia, lunesDe, sumarDias } from "@/lib/formato";
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
  const dia = diaValido(parametros.dia, hoy);
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
  const cuenta = (lista: typeof reservas) => lista.filter((r) => r.estado === "confirmada" || r.estado === "completada").length;

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
      <NavegarDia
        anterior={enlace({ dia: sumarDias(dia, vista === "dia" ? -1 : -7) })}
        hoy={enlace({ dia: hoy })}
        siguiente={enlace({ dia: sumarDias(dia, vista === "dia" ? 1 : 7) })}
      />
    </>
  );

  const nueva = <NuevaCita servicios={listaServicios.filter((s) => s.activo)} dia={dia} zona={config.zona_horaria} />;

  if (vista === "semana") {
    const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
    const porDia = new Map(dias.map((d) => [d, [] as typeof reservas]));
    for (const r of reservas) porDia.get(isoDia(new Date(r.inicio), config.zona_horaria))?.push(r);
    const conteos = dias.map((d) => cuenta(porDia.get(d) ?? []));
    return (
      <>
        <Encabezado titulo="Agenda" descripcion={`Semana del ${lunes}`} giro={giro.nombre} acciones={navegacion} principal={nueva} />
        <div className="space-y-4 px-5 py-5">
          <OcupacionSemanal conteos={conteos} />
          {dias.map((d, i) => {
            const delDia = porDia.get(d) ?? [];
            return (
              <Tarjeta key={d}>
                <TarjetaCabecera
                  titulo={`${DIAS[i]} ${d.slice(8)}`}
                  descripcion={`${cuenta(delDia)} ${cuenta(delDia) === 1 ? "cita" : "citas"}`}
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

  // Un día vacío no significa agenda vacía: si no hay citas hoy, se enseñan las
  // que vienen, con su fecha, para que nadie crea que el agente no agendó nada.
  const proximas = cuenta(reservas) === 0 ? await proximasReservas(dia) : [];
  const siguiente = proximas[0];
  const diaSiguiente = siguiente ? isoDia(new Date(siguiente.inicio), config.zona_horaria) : null;
  const descripcion = siguiente
    ? `${fechaLarga(`${dia}T12:00:00Z`, "UTC")} · sin citas este día; la siguiente es el ${fechaLarga(siguiente.inicio, config.zona_horaria)}.`
    : `${fechaLarga(`${dia}T12:00:00Z`, "UTC")} · marca Llegó cuando entre cada persona y Atendida al terminar.`;

  return (
    <>
      <Encabezado titulo="Agenda" descripcion={descripcion} giro={giro.nombre} acciones={navegacion} principal={nueva} />
      <div className="space-y-4 px-5 py-5">
        {proximas.length > 0 ? (
          <Tarjeta>
            <TarjetaCabecera
              titulo="Próximas citas"
              descripcion={`${proximas.length === 1 ? "La siguiente cita" : `Las siguientes ${proximas.length} citas`} en la agenda.`}
              accion={
                diaSiguiente ? (
                  <Link href={enlace({ dia: diaSiguiente, vista: "dia" })} className="text-xs text-tinta-3 transition hover:text-acento">
                    Ir a ese día
                  </Link>
                ) : null
              }
            />
            <ListaReservas reservas={proximas} zona={config.zona_horaria} mostrarFecha />
          </Tarjeta>
        ) : null}
        <FlujoDelDia dia={dia} base="/agenda" parametros={parametros} giro={giro} zona={config.zona_horaria} extra={{ dia, vista }} />
      </div>
    </>
  );
}
