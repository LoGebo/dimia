import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { FlujoCitas, MINUTOS_TOLERANCIA, minutosDesde, minutosLegibles, type Columna } from "@/components/flujo-citas";
import { Chip, Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { ListaReservas } from "@/components/lista-reservas";
import { NuevaCita } from "@/components/nueva-cita";
import { OcupacionSemanal } from "@/components/graficas";
import { Refrescar } from "@/components/refrescar";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { buscarReservas, citasDelDia, negocio, recursos, reservasEntre, servicios } from "@/lib/consultas";
import { fechaLarga, hora, isoDia, lunesDe, sumarDias } from "@/lib/formato";
import { exigirSeccion } from "@/lib/sesion";
import { DIAS, pasoDe, type Reserva } from "@/lib/tipos";

type Vista = "dia" | "semana";
type Filtro = "todas" | "retrasadas" | "nuevas" | "grupos" | "notas";
type Orden = "hora" | "espera";

const FILTROS: { valor: Filtro; nombre: string }[] = [
  { valor: "retrasadas", nombre: "Con retraso" },
  { valor: "nuevas", nombre: "Agendadas hoy" },
  { valor: "grupos", nombre: "Más de una persona" },
  { valor: "notas", nombre: "Con notas" },
];

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
  const [reservas, listaServicios, listaRecursos, hace7] = await Promise.all([
    reservasEntre(rangoInicio, rangoFin),
    servicios(),
    recursos(),
    citasDelDia(sumarDias(dia, -7)),
  ]);

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

  const ahora = Date.now();
  const delDia = enDia(dia);
  const filtro = (FILTROS.find((f) => f.valor === parametros.filtro)?.valor ?? "todas") as Filtro;
  const orden: Orden = parametros.orden === "espera" ? "espera" : "hora";
  const recursoActivo = listaRecursos.find((r) => r.id === parametros.recurso)?.id;

  const retrasada = (r: Reserva) => pasoDe(r) === "por_llegar" && minutosDesde(r.inicio, ahora) > MINUTOS_TOLERANCIA;
  const conteoFiltro: Record<Filtro, number> = {
    todas: delDia.length,
    retrasadas: delDia.filter(retrasada).length,
    nuevas: delDia.filter((r) => isoDia(new Date(r.creado), config.zona_horaria) === hoy).length,
    grupos: delDia.filter((r) => r.personas > 1).length,
    notas: delDia.filter((r) => Boolean(r.notas)).length,
  };

  let visibles = delDia.filter((r) => !recursoActivo || r.resource_id === recursoActivo);
  if (filtro === "retrasadas") visibles = visibles.filter(retrasada);
  if (filtro === "nuevas") visibles = visibles.filter((r) => isoDia(new Date(r.creado), config.zona_horaria) === hoy);
  if (filtro === "grupos") visibles = visibles.filter((r) => r.personas > 1);
  if (filtro === "notas") visibles = visibles.filter((r) => Boolean(r.notas));
  if (orden === "espera") {
    visibles = [...visibles].sort((a, b) => minutosDesde(b.inicio, ahora) - minutosDesde(a.inicio, ahora));
  }

  const confirmadasOAtendidas = delDia.filter((r) => r.estado === "confirmada" || r.estado === "completada");
  const personas = confirmadasOAtendidas.reduce((s, r) => s + r.personas, 0);
  const esperando = delDia.filter((r) => pasoDe(r) === "por_llegar" && minutosDesde(r.inicio, ahora) >= 0);
  const enFalta = delDia.filter(retrasada);
  const enAtencion = delDia.filter((r) => pasoDe(r) === "en_atencion");
  const ocupados = new Set(enAtencion.map((r) => r.resource_id));
  const activos = listaRecursos.filter((r) => r.activo);
  const libres = activos.filter((r) => !ocupados.has(r.id)).length;
  const variacion = hace7 > 0 ? Math.round(((confirmadasOAtendidas.length - hace7) / hace7) * 100) : null;
  const proxima = delDia.filter((r) => pasoDe(r) === "por_llegar" && minutosDesde(r.inicio, ahora) < 0)[0];
  const promedioSala =
    enAtencion.length > 0
      ? Math.round(enAtencion.reduce((s, r) => s + (r.llegada ? minutosDesde(r.llegada, ahora) : 0), 0) / enAtencion.length)
      : null;
  const esRestaurante = giro.clave === "restaurante" || giro.clave === "comida";

  const columnas: Columna[] = [
    {
      paso: "por_llegar",
      nombre: "Por llegar",
      pista: proxima ? `próxima ${hora(proxima.inicio, config.zona_horaria)}` : "sin próximas",
    },
    {
      paso: "en_atencion",
      nombre: esRestaurante ? "En mesa" : "En atención",
      pista: promedioSala !== null ? `prom. ${promedioSala} min` : "nadie adentro",
    },
    {
      paso: "no_llego",
      incluye: ["no_llego", "cancelada"],
      nombre: "Sin atender",
      pista: `${delDia.filter((r) => r.estado === "cancelada").length} canceladas`,
    },
    {
      paso: "atendida",
      nombre: "Atendidas",
      pista: `${personas} personas hoy`,
      tono: "bueno",
    },
  ];

  return (
    <>
      <Refrescar segundos={30} />
      <Encabezado
        titulo="Agenda"
        descripcion={fechaLarga(`${dia}T12:00:00Z`, "UTC")}
        giro={giro.nombre}
        acciones={navegacion}
        principal={nueva}
      />

      <div className="space-y-4 px-5 py-5">
        <TiraIndicadores>
          <Cifra
            etiqueta="Citas del día"
            valor={String(confirmadasOAtendidas.length)}
            unidad={confirmadasOAtendidas.length === 1 ? "cita" : "citas"}
            glifo={Glifos.personas}
            pildora={variacion === null ? undefined : `${variacion >= 0 ? "+" : ""}${variacion}%`}
            tono={variacion === null ? "neutro" : variacion >= 0 ? "bueno" : "alerta"}
          />
          <Cifra
            etiqueta="Esperando ahora"
            valor={String(esperando.length)}
            unidad={esperando.length === 1 ? "persona" : "personas"}
            glifo={Glifos.reloj}
            pildora={esperando.length === 0 ? "al día" : `${minutosLegibles(Math.max(...esperando.map((r) => minutosDesde(r.inicio, ahora))))} máx`}
            tono={esperando.length === 0 ? "bueno" : enFalta.length > 0 ? "alerta" : "neutro"}
          />
          <Cifra
            etiqueta={`Con más de ${MINUTOS_TOLERANCIA} min de retraso`}
            valor={String(enFalta.length)}
            glifo={Glifos.alerta}
            pildora={enFalta.length > 0 ? "en falta" : "en meta"}
            tono={enFalta.length > 0 ? "critico" : "bueno"}
          />
          <Cifra
            etiqueta={`${etiquetaRecursos(giro.clave)} libres`}
            valor={String(libres)}
            unidad={`de ${activos.length}`}
            glifo={Glifos.recurso}
            pildora={activos.length > 0 && libres === 0 ? "todo ocupado" : undefined}
            tono="alerta"
          />
        </TiraIndicadores>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip activo={!recursoActivo} href={enlace({ recurso: undefined })}>
              Todo
            </Chip>
            {activos.map((r) => (
              <Chip key={r.id} activo={recursoActivo === r.id} href={enlace({ recurso: r.id })}>
                {r.nombre}
              </Chip>
            ))}
          </div>
          <span aria-hidden="true" className="hidden h-5 w-px bg-linea sm:block" />
          <Chip activo={orden === "espera"} href={enlace({ orden: orden === "espera" ? undefined : "espera" })}>
            Ordenar por espera
          </Chip>
          <span className="numeros ml-auto font-mono text-[11px] text-tinta-3">
            {visibles.length} de {delDia.length} citas
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS.map((f) => (
            <Chip
              key={f.valor}
              activo={filtro === f.valor}
              href={enlace({ filtro: filtro === f.valor ? undefined : f.valor })}
              conteo={conteoFiltro[f.valor]}
            >
              {f.nombre}
            </Chip>
          ))}
        </div>

        {delDia.length === 0 ? (
          <div className="border border-linea bg-panel">
            <Vacio
              titulo="Día libre"
              detalle="No hay citas para esta fecha. Cuando el agente agende una por teléfono, aparece aquí sola."
              accion={<div className="mt-2">{nueva}</div>}
            />
          </div>
        ) : (
          <FlujoCitas
            columnas={columnas}
            reservas={visibles}
            zona={config.zona_horaria}
            ahora={ahora}
            nuevaCita={
              <NuevaCita
                servicios={listaServicios.filter((s) => s.activo)}
                dia={dia}
                zona={config.zona_horaria}
                variante="columna"
              />
            }
          />
        )}
      </div>
    </>
  );
}

function etiquetaRecursos(vertical: string): string {
  const nombres: Record<string, string> = {
    clinica: "Consultorios",
    restaurante: "Mesas",
    comida: "Mesas",
    salon: "Estaciones",
    taller: "Bahías",
    inmobiliaria: "Asesores",
  };
  return nombres[vertical] ?? "Recursos";
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
