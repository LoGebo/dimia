import {
  FlujoCitas,
  MINUTOS_TOLERANCIA,
  minutosDesde,
  minutosLegibles,
  type Columna,
} from "@/components/flujo-citas";
import { Chip, Cifra, TiraIndicadores } from "@/components/indicadores";
import { NuevaCita } from "@/components/nueva-cita";
import { Refrescar } from "@/components/refrescar";
import { Vacio } from "@/components/ui/primitivos";
import {
  citasDelDia,
  recursos,
  reservasEntre,
  servicios,
} from "@/lib/consultas";
import { hora, isoDia, sumarDias } from "@/lib/formato";
import type { Giro } from "@/lib/sesion";
import {
  etiquetasRecurso,
  pasoDe,
  resumenCitas,
  type Reserva,
} from "@/lib/tipos";

type Filtro = "todas" | "retrasadas" | "nuevas" | "grupos" | "notas";
type Orden = "hora" | "espera";

const FILTROS: { valor: Filtro; nombre: string }[] = [
  { valor: "retrasadas", nombre: "Con retraso" },
  { valor: "nuevas", nombre: "Agendadas hoy" },
  { valor: "grupos", nombre: "Más de una persona" },
  { valor: "notas", nombre: "Con notas" },
];

export type ParametrosDia = {
  recurso?: string;
  filtro?: string;
  orden?: string;
};

/** El tablero de un día en la Agenda: cifras, filtros y columnas. */
export async function FlujoDelDia({
  dia,
  base,
  parametros,
  giro,
  zona,
  extra = {},
}: {
  dia: string;
  base: string;
  parametros: ParametrosDia;
  giro: Giro;
  zona: string;
  /** Parámetros que la página quiere conservar en los enlaces (por ejemplo `dia`). */
  extra?: Record<string, string | undefined>;
}) {
  const hoy = isoDia(new Date(), zona);
  const [delDia, listaServicios, listaRecursos, hace7] = await Promise.all([
    reservasEntre(dia, dia),
    servicios(),
    recursos(),
    citasDelDia(sumarDias(dia, -7)),
  ]);

  const enlace = (cambios: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const todos: Record<string, string | undefined> = {
      ...extra,
      recurso: parametros.recurso,
      filtro: parametros.filtro,
      orden: parametros.orden,
      ...cambios,
    };
    for (const [k, v] of Object.entries(todos)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `${base}?${q}` : base;
  };

  const ahora = Date.now();
  const filtro = (FILTROS.find((f) => f.valor === parametros.filtro)?.valor ??
    "todas") as Filtro;
  const orden: Orden = parametros.orden === "espera" ? "espera" : "hora";
  const recursoActivo = listaRecursos.find(
    (r) => r.id === parametros.recurso,
  )?.id;
  const retrasada = (r: Reserva) =>
    pasoDe(r) === "por_llegar" &&
    minutosDesde(r.inicio, ahora) > MINUTOS_TOLERANCIA;
  const conteoFiltro: Record<Filtro, number> = {
    todas: delDia.length,
    retrasadas: delDia.filter(retrasada).length,
    nuevas: delDia.filter((r) => isoDia(new Date(r.creado), zona) === hoy)
      .length,
    grupos: delDia.filter((r) => r.personas > 1).length,
    notas: delDia.filter((r) => Boolean(r.notas)).length,
  };

  let visibles = delDia.filter(
    (r) => !recursoActivo || r.resource_id === recursoActivo,
  );
  if (filtro === "retrasadas") visibles = visibles.filter(retrasada);
  if (filtro === "nuevas")
    visibles = visibles.filter((r) => isoDia(new Date(r.creado), zona) === hoy);
  if (filtro === "grupos") visibles = visibles.filter((r) => r.personas > 1);
  if (filtro === "notas") visibles = visibles.filter((r) => Boolean(r.notas));
  if (orden === "espera")
    visibles = [...visibles].sort(
      (a, b) => minutosDesde(b.inicio, ahora) - minutosDesde(a.inicio, ahora),
    );

  const {
    citas: confirmadasOAtendidas,
    enAtencion,
    porLlegar,
  } = resumenCitas(delDia);
  const personas = confirmadasOAtendidas.reduce((s, r) => s + r.personas, 0);
  const esperando = porLlegar.filter((r) => minutosDesde(r.inicio, ahora) >= 0);
  const enFalta = delDia.filter(retrasada);
  const activos = listaRecursos.filter((r) => r.activo);
  const ocupados = new Set(enAtencion.map((r) => r.resource_id));
  const libres = activos.filter((r) => !ocupados.has(r.id)).length;
  const variacion =
    hace7 > 0
      ? Math.round(((confirmadasOAtendidas.length - hace7) / hace7) * 100)
      : null;
  const proxima = porLlegar.find((r) => minutosDesde(r.inicio, ahora) < 0);
  const promedioSala =
    enAtencion.length > 0
      ? Math.round(
          enAtencion.reduce(
            (s, r) => s + (r.llegada ? minutosDesde(r.llegada, ahora) : 0),
            0,
          ) / enAtencion.length,
        )
      : null;
  const esRestaurante = giro.clave === "restaurante" || giro.clave === "comida";

  const columnas: Columna[] = [
    {
      paso: "por_llegar",
      nombre: "Por llegar",
      pista: proxima ? `próxima ${hora(proxima.inicio, zona)}` : "sin próximas",
    },
    {
      paso: "en_atencion",
      nombre: esRestaurante ? "En mesa" : "En atención",
      pista:
        promedioSala !== null ? `prom. ${promedioSala} min` : "nadie adentro",
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
      pista: `${personas} personas`,
      tono: "bueno",
    },
  ];

  const nueva = (variante: "principal" | "columna") => (
    <NuevaCita
      servicios={listaServicios.filter((s) => s.activo)}
      dia={dia}
      zona={zona}
      variante={variante}
    />
  );

  return (
    <>
      <Refrescar segundos={30} />
      <TiraIndicadores>
        <Cifra
          etiqueta="Citas del día"
          valor={String(confirmadasOAtendidas.length)}
          unidad={confirmadasOAtendidas.length === 1 ? "cita" : "citas"}
          pildora={
            variacion === null
              ? undefined
              : `${variacion >= 0 ? "+" : ""}${variacion}% vs. hace 7 días`
          }
          tono={
            variacion === null ? "neutro" : variacion >= 0 ? "bueno" : "alerta"
          }
        />
        <Cifra
          etiqueta="Esperando ahora"
          valor={String(esperando.length)}
          unidad={esperando.length === 1 ? "persona" : "personas"}
          pildora={
            esperando.length === 0
              ? "al día"
              : `${minutosLegibles(Math.max(...esperando.map((r) => minutosDesde(r.inicio, ahora))))} la que más`
          }
          tono={
            esperando.length === 0
              ? "bueno"
              : enFalta.length > 0
                ? "alerta"
                : "neutro"
          }
        />
        <Cifra
          etiqueta={`${etiquetasRecurso(giro.clave).plural} libres`}
          valor={String(libres)}
          unidad={`de ${activos.length}`}
          pildora={
            activos.length > 0 && libres === 0 ? "todo ocupado" : undefined
          }
          tono="alerta"
        />
      </TiraIndicadores>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip activo={!recursoActivo} href={enlace({ recurso: undefined })}>
          Todo
        </Chip>
        {activos.map((r) => (
          <Chip
            key={r.id}
            activo={recursoActivo === r.id}
            href={enlace({ recurso: r.id })}
          >
            {r.nombre}
          </Chip>
        ))}
        <span
          aria-hidden="true"
          className="hidden h-5 w-px bg-linea sm:block"
        />
        {FILTROS.filter(
          (f) => conteoFiltro[f.valor] > 0 || filtro === f.valor,
        ).map((f) => (
          <Chip
            key={f.valor}
            activo={filtro === f.valor}
            href={enlace({ filtro: filtro === f.valor ? undefined : f.valor })}
            conteo={conteoFiltro[f.valor]}
          >
            {f.nombre}
          </Chip>
        ))}
        <Chip
          activo={orden === "espera"}
          href={enlace({ orden: orden === "espera" ? undefined : "espera" })}
        >
          Por espera
        </Chip>
        <span className="numeros ml-auto font-mono text-[11px] text-tinta-3">
          {visibles.length} de {delDia.length}
        </span>
      </div>

      {delDia.length === 0 ? (
        <div className="border border-linea bg-panel">
          <Vacio
            titulo="Día libre"
            detalle="No hay citas para esta fecha. Cuando el agente agende una por teléfono, aparece aquí sola. También puedes agregarla tú."
            accion={<div className="mt-2">{nueva("principal")}</div>}
          />
        </div>
      ) : (
        <FlujoCitas
          columnas={columnas}
          reservas={visibles}
          delDia={delDia}
          zona={zona}
          ahora={ahora}
          nuevaCita={nueva("columna")}
        />
      )}
    </>
  );
}
