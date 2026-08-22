import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { ListaReservas } from "@/components/lista-reservas";
import { OcupacionSemanal } from "@/components/graficas";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { buscarReservas, negocio, reservasEntre } from "@/lib/consultas";
import { fechaLarga, isoDia, lunesDe, sumarDias } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { DIAS } from "@/lib/tipos";

type Vista = "dia" | "semana";

export default async function Agenda({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; vista?: string; q?: string }>;
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
          acciones={<Buscador valor={busqueda} dia={dia} vista={vista} />}
        />
        <div className="px-6 py-5">
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
  const reservas = await reservasEntre(rangoInicio, rangoFin);

  const enDia = (objetivo: string) =>
    reservas.filter((r) => isoDia(new Date(r.inicio), config.zona_horaria) === objetivo);

  const dias = Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  const conteos = dias.map((d) => enDia(d).filter((r) => r.estado === "confirmada").length);

  return (
    <>
      <Encabezado
        titulo="Agenda"
        descripcion={vista === "dia" ? fechaLarga(`${dia}T12:00:00Z`, "UTC") : `Semana del ${lunes}`}
        giro={giro.nombre}
        acciones={
          <>
            <Buscador valor="" dia={dia} vista={vista} />
            <div className="flex overflow-hidden rounded-md border border-linea bg-panel">
              {(["dia", "semana"] as const).map((v) => (
                <Link
                  key={v}
                  href={`/agenda?dia=${dia}&vista=${v}`}
                  className={`px-2.5 py-1 text-xs transition ${
                    v === vista ? "bg-acento-suave font-medium text-acento" : "text-tinta-2 hover:bg-panel-2"
                  }`}
                >
                  {v === "dia" ? "Día" : "Semana"}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Navegar destino={`/agenda?dia=${sumarDias(dia, vista === "dia" ? -1 : -7)}&vista=${vista}`} etiqueta="‹" />
              <Link
                href={`/agenda?dia=${hoy}&vista=${vista}`}
                className="rounded-md border border-linea bg-panel px-2.5 py-1 text-xs text-tinta-2 transition hover:bg-panel-2"
              >
                Hoy
              </Link>
              <Navegar destino={`/agenda?dia=${sumarDias(dia, vista === "dia" ? 1 : 7)}&vista=${vista}`} etiqueta="›" />
            </div>
          </>
        }
      />

      <div className="space-y-4 px-6 py-5">
        {vista === "semana" ? <OcupacionSemanal conteos={conteos} /> : null}

        {vista === "dia" ? (
          <Tarjeta>
            <TarjetaCabecera
              titulo={`${enDia(dia).filter((r) => r.estado === "confirmada").length} reservas confirmadas`}
              descripcion={fechaLarga(`${dia}T12:00:00Z`, "UTC")}
            />
            {enDia(dia).length === 0 ? (
              <Vacio titulo="Día libre" detalle="No hay reservas para esta fecha." />
            ) : (
              <ListaReservas reservas={enDia(dia)} zona={config.zona_horaria} />
            )}
          </Tarjeta>
        ) : (
          dias.map((d, i) => {
            const delDia = enDia(d);
            return (
              <Tarjeta key={d}>
                <TarjetaCabecera
                  titulo={`${DIAS[i]} ${d.slice(8)}`}
                  descripcion={`${delDia.filter((r) => r.estado === "confirmada").length} confirmadas`}
                  accion={
                    <Link
                      href={`/agenda?dia=${d}&vista=dia`}
                      className="text-xs text-tinta-3 transition hover:text-acento"
                    >
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
          })
        )}
      </div>
    </>
  );
}

function Navegar({ destino, etiqueta }: { destino: string; etiqueta: string }) {
  return (
    <Link
      href={destino}
      className="flex h-[26px] w-7 items-center justify-center rounded-md border border-linea bg-panel text-tinta-2 transition hover:bg-panel-2"
    >
      {etiqueta}
    </Link>
  );
}

function Buscador({ valor, dia, vista }: { valor: string; dia: string; vista: string }) {
  return (
    <form action="/agenda" className="flex items-center gap-1">
      <input type="hidden" name="dia" value={dia} />
      <input type="hidden" name="vista" value={vista} />
      <input
        name="q"
        defaultValue={valor}
        placeholder="Código, teléfono o nombre"
        className="h-[26px] w-56 rounded-md border border-linea bg-panel px-2.5 text-xs text-tinta outline-none placeholder:text-tinta-3 focus:border-acento"
      />
    </form>
  );
}
