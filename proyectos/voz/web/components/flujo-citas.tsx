import Link from "next/link";
import { cancelarReserva, moverCita, type PasoFlujo } from "@/lib/acciones";
import { Cobrar } from "@/components/cobrar";
import { Formulario } from "@/components/formulario";
import { Reagendar } from "@/components/reagendar";
import { hora, iniciales, moneda, telefono } from "@/lib/formato";
import { pasoDe, type PasoCita, type Reserva } from "@/lib/tipos";

export const MINUTOS_TOLERANCIA = 15;

export type Columna = { paso: PasoCita; incluye?: PasoCita[]; nombre: string; pista: string; tono?: "bueno" };

export function minutosLegibles(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function minutosDesde(iso: string, ahora: number): number {
  return Math.round((ahora - new Date(iso).getTime()) / 60000);
}

function nombreCorto(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  if (partes.length < 2) return nombre;
  return `${partes[0]} ${partes[1]![0]}.`;
}

/**
 * El tablero del día: una columna por paso. La cita entra por la izquierda y
 * sale por la derecha. Cada tarjeta trae lo que hay que saber para actuar.
 */
export function FlujoCitas({
  columnas,
  reservas,
  delDia = reservas,
  zona,
  ahora,
  nuevaCita,
}: {
  columnas: Columna[];
  /** Las que se pintan: ya filtradas por recurso o por chip. */
  reservas: Reserva[];
  /** Todas las del día, para que el resumen no cambie con el filtro. */
  delDia?: Reserva[];
  zona: string;
  ahora: number;
  nuevaCita?: React.ReactNode;
}) {
  const destino = new Map<PasoCita, PasoCita>();
  for (const c of columnas) for (const p of c.incluye ?? [c.paso]) destino.set(p, c.paso);
  const porPaso = new Map<PasoCita, Reserva[]>(columnas.map((c) => [c.paso, []]));
  for (const r of reservas) {
    const columna = destino.get(pasoDe(r));
    if (columna) porPaso.get(columna)?.push(r);
  }

  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2">
      <div className="grid min-w-[960px] auto-cols-fr grid-flow-col gap-3">
        {columnas.map((c) => {
          const lista = porPaso.get(c.paso) ?? [];
          return (
            <section
              key={c.paso}
              aria-label={c.nombre}
              className={`flex min-h-[420px] flex-col border ${
                c.tono === "bueno" ? "border-bueno/30 bg-bueno/[0.04]" : "border-linea bg-panel-2/60"
              }`}
            >
              <header className="flex items-baseline justify-between gap-2 px-3 pt-3 pb-2">
                <h2 className="flex items-center gap-2 text-[13px] font-semibold text-tinta">
                  {c.nombre}
                  <span className="numeros bg-panel px-1.5 font-mono text-[11px] font-normal text-tinta-2">
                    {lista.length}
                  </span>
                </h2>
                <span className="numeros truncate font-mono text-[10px] tracking-wider text-tinta-3 uppercase">
                  {c.pista}
                </span>
              </header>

              {c.paso === "atendida" ? <ResumenAtendidas lista={delDia.filter((r) => pasoDe(r) === "atendida")} total={delDia} /> : null}

              <ul className="flex flex-1 flex-col gap-2 px-2 pb-2">
                {lista.map((r) => (
                  <Tarjeta key={r.id} reserva={r} paso={pasoDe(r)} zona={zona} ahora={ahora} />
                ))}
                {lista.length === 0 ? (
                  <li className="px-2 py-6 text-center text-[12px] text-tinta-3">Nada aquí todavía.</li>
                ) : null}
              </ul>

              {c.paso === "por_llegar" && nuevaCita ? (
                <div className="border-t border-linea/60 px-2 py-2">{nuevaCita}</div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ResumenAtendidas({ lista, total }: { lista: Reserva[]; total: Reserva[] }) {
  const personas = lista.reduce((s, r) => s + r.personas, 0);
  const ingreso = lista.reduce((s, r) => s + Number(r.cobrado ?? 0), 0);
  const conPrecio = lista.filter((r) => r.cobrado !== null).length;
  const esperadas = total.filter((r) => r.estado === "confirmada" || r.estado === "completada").length;
  const avance = esperadas > 0 ? Math.round((lista.length / esperadas) * 100) : 0;

  return (
    <div className="mx-2 mb-2 border border-bueno/30 bg-panel px-3 py-3">
      <p className="text-[12px] font-semibold text-tinta">Hoy hasta ahora</p>
      <dl className="mt-2 space-y-1.5 text-[12px]">
        <div className="flex justify-between gap-2">
          <dt className="text-tinta-2">Atendidas</dt>
          <dd className="numeros font-mono font-medium text-tinta">{lista.length}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-tinta-2">Personas</dt>
          <dd className="numeros font-mono font-medium text-tinta">{personas}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-tinta-2">Cobrado</dt>
          <dd className="numeros font-mono font-medium text-tinta">
            {conPrecio > 0 ? moneda(ingreso) : "—"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 h-[3px] bg-linea" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-bueno" style={{ width: `${avance}%` }} />
      </div>
      <p className="numeros mt-1.5 font-mono text-[10px] text-tinta-3">{avance}% de las citas del día</p>
    </div>
  );
}

function Tarjeta({ reserva: r, paso, zona, ahora }: { reserva: Reserva; paso: PasoCita; zona: string; ahora: number }) {
  const cobrado = r.cobrado;
  const desdeInicio = minutosDesde(r.inicio, ahora);
  const retraso = paso === "por_llegar" && desdeInicio > 0 ? desdeInicio : 0;
  const enFalta = retraso > MINUTOS_TOLERANCIA;
  const enSala = paso === "en_atencion" && r.llegada ? minutosDesde(r.llegada, ahora) : 0;
  const duracionEsperada = minutosDesde(r.fin, new Date(r.inicio).getTime()) * -1;
  const excedida = paso === "en_atencion" && enSala > duracionEsperada;
  const apagada = paso === "no_llego" || paso === "cancelada";

  let tiempo: { texto: string; tono: "neutro" | "alerta" | "critico" | "bueno" };
  if (paso === "por_llegar") {
    tiempo =
      desdeInicio < 0
        ? { texto: `en ${minutosLegibles(-desdeInicio)}`, tono: "neutro" }
        : desdeInicio === 0
          ? { texto: "ahora", tono: "bueno" }
          : { texto: `+${minutosLegibles(desdeInicio)}`, tono: enFalta ? "critico" : "alerta" };
  } else if (paso === "en_atencion") {
    tiempo = { texto: minutosLegibles(enSala), tono: excedida ? "alerta" : "bueno" };
  } else {
    tiempo = { texto: `${hora(r.inicio, zona)} a ${hora(r.fin, zona)}`, tono: "neutro" };
  }

  const TONO = {
    neutro: "bg-panel-2 text-tinta-2",
    bueno: "bg-bueno/12 text-bueno",
    alerta: "bg-alerta/12 text-alerta",
    critico: "bg-critico/12 text-critico",
  } as const;

  const aviso = enFalta
    ? `${minutosLegibles(retraso)} de retraso. Márquele al ${telefono(r.telefono)} o libere el horario.`
    : excedida
      ? `Lleva ${minutosLegibles(enSala - duracionEsperada)} más de lo previsto para ${r.servicio}.`
      : null;

  return (
    <li
      className={`border bg-panel ${
        enFalta ? "border-critico/40" : excedida ? "border-alerta/40" : "border-linea"
      } ${apagada ? "opacity-60" : ""}`}
    >
      <div className="px-3 pt-3">
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden="true"
            className={`flex h-8 w-8 flex-none items-center justify-center font-mono text-[11px] font-medium ${
              paso === "en_atencion" ? "bg-acento text-acento-tinta" : "bg-acento-suave text-acento"
            }`}
          >
            {iniciales(r.cliente_nombre)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-tinta" title={r.cliente_nombre}>
              {r.cliente_id ? (
                <Link href={`/clientes/${r.cliente_id}`} className="transition hover:text-acento">
                  {nombreCorto(r.cliente_nombre)}
                </Link>
              ) : (
                nombreCorto(r.cliente_nombre)
              )}
            </p>
            <p className="truncate text-[12px] text-tinta-2">
              {r.servicio}
              {r.personas > 1 ? ` · ${r.personas} personas` : ""}
            </p>
          </div>
          {apagada ? (
            <span className={`px-1.5 py-0.5 text-[10px] font-medium ${paso === "cancelada" ? "bg-panel-2 text-tinta-2" : "bg-critico/12 text-critico"}`}>
              {paso === "cancelada" ? "Cancelada" : "No llegó"}
            </span>
          ) : (
            <span className="numeros font-mono text-[10px] tracking-wider text-tinta-3">{r.codigo}</span>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-tinta-3">
          <span className="truncate">{r.recurso}</span>
          <span aria-hidden="true">·</span>
          <span className="numeros font-mono">{hora(r.inicio, zona)}</span>
          <span className={`numeros ml-auto px-1.5 py-0.5 font-mono text-[11px] ${TONO[tiempo.tono]}`}>
            {tiempo.texto}
          </span>
        </div>
      </div>

      {aviso ? (
        <p className={`mx-3 mt-2.5 px-2.5 py-2 text-[11px] leading-snug ${enFalta ? "bg-critico/10 text-critico" : "bg-alerta/10 text-alerta"}`}>
          {aviso}
        </p>
      ) : r.notas ? (
        <p className="mx-3 mt-2.5 bg-panel-2 px-2.5 py-2 text-[11px] leading-snug text-tinta-2" title={r.notas}>
          {r.notas}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-1 border-t border-linea px-2 py-1.5">
        {paso === "por_llegar" ? (
          <>
            <Paso id={r.id} paso="llego" principal>
              Llegó
            </Paso>
            <Reagendar reserva={r} zona={zona} />
            <Paso id={r.id} paso="no_llego">
              No llegó
            </Paso>
            <Formulario accion={cancelarReserva} className="ml-auto">
              <input type="hidden" name="id" value={r.id} />
              <button className="h-7 px-2 text-[12px] text-tinta-3 transition hover:text-critico">Cancelar</button>
            </Formulario>
          </>
        ) : null}
        {paso === "en_atencion" ? (
          <>
            <Paso id={r.id} paso="atendida" principal>
              Atendida
            </Paso>
            <Paso id={r.id} paso="regresar">
              Regresar
            </Paso>
          </>
        ) : null}
        {paso === "atendida" ? (
          <>
            {cobrado ? (
              <span className="numeros px-2 py-1 font-mono text-[11px] text-bueno">Cobrado {moneda(cobrado)}</span>
            ) : (
              <Cobrar bookingId={r.id} concepto={`${r.servicio} · ${r.cliente_nombre}`} montoSugerido={r.precio} compacto />
            )}
            <span className="ml-auto px-2 py-1 text-[11px] text-tinta-3">Entró {r.llegada ? hora(r.llegada, zona) : "—"}</span>
          </>
        ) : null}
        {apagada ? (
          <Link
            href={`/bandeja`}
            className="px-2 py-1 text-[11px] text-tinta-3 transition hover:text-acento"
          >
            {telefono(r.telefono)}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

function Paso({
  id,
  paso,
  principal = false,
  children,
}: {
  id: string;
  paso: PasoFlujo;
  principal?: boolean;
  children: string;
}) {
  return (
    <Formulario accion={moverCita}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="paso" value={paso} />
      <button
        className={`h-7 px-2.5 text-[12px] font-medium transition ${
          principal
            ? "bg-acento text-acento-tinta hover:brightness-110"
            : "text-tinta-2 hover:bg-panel-2 hover:text-tinta"
        }`}
      >
        {children}
      </button>
    </Formulario>
  );
}
