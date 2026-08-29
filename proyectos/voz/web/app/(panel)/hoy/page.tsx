import Link from "next/link";
import { RenglonConversacion } from "@/components/renglon-conversacion";
import { Encabezado } from "@/components/encabezado";
import { Tarjeta, TarjetaCabecera } from "@/components/ui/primitivos";
import { MINUTOS_TOLERANCIA, minutosDesde, minutosLegibles } from "@/components/flujo-citas";
import { Avance, BarraSegmentada, BarrasMini, Chispa, FilaKpis, GraficaLineas, Kpi, type Insight } from "@/components/kit";
import { Estampa, FilaLista } from "@/components/kit/operacion";
import {
  alertasHoy,
  clientes,
  cobrosPorDia,
  conversaciones,
  llamadasPorDia,
  negocio,
  pagosPendientes,
  pedidosDelDia,
  recados,
  resenasResumen,
  reservasEntre,
  resumenCobros,
  resumenLlamadas,
} from "@/lib/consultas";
import { fechaCorta, fechaLarga, hora, isoDia, moneda, porcentaje, telefono } from "@/lib/formato";
import { avance } from "@/lib/listo";
import { contexto } from "@/lib/sesion";
import { resumenCitas } from "@/lib/tipos";

const DIAS_GRAFICA = 14;

/**
 * El tablero de inicio: una sola hoja dividida por reglas. Arriba lo que
 * necesita atención; luego cuatro cifras con su gráfica chica; después la
 * gráfica de la quincena junto a lo que viene; al final lo que entró, las
 * sugerencias y cómo les fue. Para operar el día se va a Agenda o a Pedidos.
 */
export default async function Hoy() {
  const { giro } = await contexto();
  const [config, progreso] = await Promise.all([negocio(), avance(giro.herramientas)]);
  const hoy = isoDia(new Date(), config.zona_horaria);
  const zona = config.zona_horaria;
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");

  if (!progreso.completo || !progreso.tieneNumero) return <ParaEmpezar progreso={progreso} giro={giro.nombre} />;

  const [alertas, hilos, llamadas7, porDia, cobros, cobrosDias, resenas, reservas, listaPedidos, listaRecados, inactivos, faltan, pendientes] =
    await Promise.all([
      alertasHoy(),
      conversaciones(5),
      resumenLlamadas(7),
      llamadasPorDia(DIAS_GRAFICA),
      resumenCobros(hoy),
      cobrosPorDia(DIAS_GRAFICA),
      resenasResumen(30),
      agenda ? reservasEntre(hoy, hoy) : Promise.resolve([]),
      pedidos ? pedidosDelDia(hoy) : Promise.resolve([]),
      !agenda && !pedidos ? recados(true) : Promise.resolve([]),
      clientes("inactivos"),
      agenda ? clientes("faltan") : Promise.resolve([]),
      pagosPendientes(),
    ]);
  const ahora = Date.now();
  const insights = sugerencias({ inactivos, faltan, pendientes, ahora });
  const horaLocal = Number(new Intl.DateTimeFormat("es-MX", { hour: "numeric", hour12: false, timeZone: zona }).format(new Date()));
  const saludo = horaLocal < 12 ? "Buenos días" : horaLocal < 19 ? "Buenas tardes" : "Buenas noches";
  const { citas: citasHoy, atendidas, enAtencion, porLlegar } = resumenCitas(reservas);
  const proximas = porLlegar.slice(0, 7);
  const porSacar = listaPedidos.filter((p) => p.estado === "abierto" || p.estado === "confirmado");
  const sinLeer = alertas.mensajes_sin_leer;
  const totalResenas = resenas.reduce((s, r) => s + r.total, 0);
  const promedio = totalResenas > 0 ? resenas.reduce((s, r) => s + Number(r.promedio) * r.total, 0) / totalResenas : null;
  const contencion = llamadas7.total > 0 ? llamadas7.resueltas / llamadas7.total : null;

  const ultimos7 = porDia.slice(-7);
  const previos7 = porDia.slice(-14, -7);
  const llamadasPrev = previos7.reduce((s, d) => s + d.total, 0);
  const variacionLlamadas = llamadasPrev > 0 ? (llamadas7.total - llamadasPrev) / llamadasPrev : null;
  const citasPorHora = Array.from({ length: 12 }, (_, i) => {
    const h = 8 + i;
    return citasHoy.filter((r) => Number(new Intl.DateTimeFormat("es-MX", { hour: "numeric", hour12: false, timeZone: zona }).format(new Date(r.inicio))) === h).length;
  });
  const etiquetasDias = porDia.map((d) => fechaCorta(`${d.dia}T12:00:00Z`, "UTC"));

  const avisos: { texto: string; href: string; tono: "critico" | "alerta" | "acento"; dato?: string; rotulo: string }[] = [];
  if (alertas.retrasadas > 0)
    avisos.push({
      texto: `${alertas.retrasadas === 1 ? "Una persona lleva" : `${alertas.retrasadas} personas llevan`} más de ${MINUTOS_TOLERANCIA} minutos de retraso`,
      href: "/agenda?filtro=retrasadas",
      tono: "critico",
      dato: `${alertas.retrasadas}`,
      rotulo: "Urgente",
    });
  if (alertas.escaladas > 0)
    avisos.push({
      texto: `${alertas.escaladas === 1 ? "Una conversación pidió" : `${alertas.escaladas} conversaciones pidieron`} una persona`,
      href: "/bandeja",
      tono: "alerta",
      dato: `${alertas.escaladas}`,
      rotulo: "Pendiente",
    });
  if (alertas.recados > 0)
    avisos.push({
      texto: `${alertas.recados === 1 ? "Un recado espera" : `${alertas.recados} recados esperan`} que le marque`,
      href: "/recados",
      tono: "alerta",
      dato: `${alertas.recados}`,
      rotulo: "Pendiente",
    });
  if (alertas.por_cobrar_atendidas > 0)
    avisos.push({
      texto: `${alertas.por_cobrar_atendidas === 1 ? "Una cita atendida hoy" : `${alertas.por_cobrar_atendidas} citas atendidas hoy`} sin cobro registrado`,
      href: "/agenda",
      tono: "alerta",
      dato: `${alertas.por_cobrar_atendidas}`,
      rotulo: "Pendiente",
    });
  if (alertas.cobros_pendientes > 0)
    avisos.push({
      texto: `Por cobrar en ${alertas.cobros_pendientes === 1 ? "un pago pendiente" : `${alertas.cobros_pendientes} pagos pendientes`}`,
      href: "/cobros",
      tono: "alerta",
      dato: moneda(alertas.cobros_monto),
      rotulo: "Pendiente",
    });
  if (alertas.campanas_contestaron > 0)
    avisos.push({
      texto: `${alertas.campanas_contestaron === 1 ? "Una persona contestó" : `${alertas.campanas_contestaron} personas contestaron`} a una campaña`,
      href: "/campanas",
      tono: "acento",
      dato: `${alertas.campanas_contestaron}`,
      rotulo: "Novedad",
    });

  const CUADRO = { critico: "bg-critico late", alerta: "bg-alerta", acento: "bg-acento" } as const;

  return (
    <>
      <Encabezado titulo="Hoy" descripcion={`${saludo}. ${fechaLarga(`${hoy}T12:00:00Z`, "UTC")} · así va el día.`} />

      <div className="entra space-y-4">
        {avisos.length > 0 ? (
          <section aria-label="Necesita atención" className="overflow-hidden rounded-lg border border-linea bg-panel">
            <ul className="divide-y divide-linea">
              {avisos.map((a) => (
                <li key={a.texto}>
                  <Link href={a.href} className="flex h-10 items-center gap-3 px-5 transition-colors duration-150 hover:bg-panel-2 focus-visible:bg-panel-2 focus-visible:outline-none">
                    <i aria-hidden="true" className={`h-1.5 w-1.5 flex-none ${CUADRO[a.tono]}`} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-tinta">{a.texto}</span>
                    {a.dato ? <span className="numeros text-[13px] font-semibold text-tinta">{a.dato}</span> : null}
                    <span className={`w-20 text-right text-[12px] ${a.tono === "critico" ? "text-critico" : "text-tinta-3"}`}>{a.rotulo}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <FilaKpis>
          {agenda ? (
            <Kpi
              etiqueta="Citas de hoy"
              valor={citasHoy.length}
              unidad={`${atendidas} atendidas`}
              variacion={enAtencion.length > 0 ? { texto: `${enAtencion.length} en atención`, tono: "bueno" } : undefined}
            >
              <BarrasMini valores={citasPorHora} resaltar={Math.max(0, Math.min(11, horaLocal - 8))} />
            </Kpi>
          ) : null}
          {pedidos ? (
            <Kpi
              etiqueta="Pedidos de hoy"
              valor={listaPedidos.length}
              unidad={`${porSacar.length} por sacar`}
              variacion={porSacar.length > 0 ? { texto: "en cocina", tono: "alerta" } : { texto: "al día", tono: "bueno" }}
            >
              <BarraSegmentada
                segmentos={[
                  { nombre: "entregados", valor: listaPedidos.length - porSacar.length, color: "var(--bueno)" },
                  { nombre: "por sacar", valor: porSacar.length, color: "var(--alerta)" },
                ]}
              />
            </Kpi>
          ) : null}
          <Kpi
            etiqueta="Cobrado hoy"
            valor={Number(cobros.cobrado)}
            formato="moneda"
            unidad={`${cobros.operaciones} ${cobros.operaciones === 1 ? "cobro" : "cobros"}`}
            variacion={Number(cobros.pendiente) > 0 ? { texto: `${moneda(cobros.pendiente)} por cobrar`, tono: "alerta" } : undefined}
          >
            <BarrasMini valores={cobrosDias.map((d) => Number(d.cobrado))} resaltar={cobrosDias.length - 1} color="var(--bueno)" />
          </Kpi>
          <Kpi
            etiqueta="Mensajes sin leer"
            valor={sinLeer}
            variacion={alertas.escaladas > 0 ? { texto: `${alertas.escaladas} piden persona`, tono: "alerta" } : undefined}
          >
            <BarraSegmentada
              segmentos={[
                { nombre: "sin leer", valor: sinLeer, color: "var(--acento)" },
                { nombre: "piden persona", valor: alertas.escaladas, color: "var(--alerta)" },
                { nombre: "al día", valor: Math.max(0, hilos.length - sinLeer - alertas.escaladas), color: "var(--linea-fuerte)" },
              ]}
            />
          </Kpi>
          <Kpi
            etiqueta="Llamadas en 7 días"
            valor={llamadas7.total}
            unidad={contencion === null ? undefined : `${porcentaje(contencion)} solas`}
            variacion={
              variacionLlamadas === null
                ? undefined
                : { texto: `${variacionLlamadas >= 0 ? "+" : ""}${Math.round(variacionLlamadas * 100)}% vs. la anterior`, tono: variacionLlamadas >= 0 ? "bueno" : "neutro" }
            }
          >
            <Chispa serie={ultimos7.map((d) => d.total)} alto={28} className="h-7" />
          </Kpi>
        </FilaKpis>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section aria-label="Llamadas de la quincena" className="min-w-0 rounded-lg border border-linea bg-panel px-5 pt-4 pb-5">
            <header className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-tinta">Llamadas de la quincena</h2>
                <p className="mt-0.5 text-[12px] text-tinta-3">Cuántas entraron cada día y cuántas resolvió el agente sin pasar a nadie.</p>
              </div>
              <Link href="/resumen" className="text-[13px] font-bold whitespace-nowrap text-acento transition-colors duration-150 hover:text-tinta">
                Informe completo
              </Link>
            </header>
            <GraficaLineas
              className="mt-4"
              series={[
                { nombre: "Resueltas por el agente", color: "var(--acento)", valores: porDia.map((d) => d.resueltas) },
                { nombre: "Llamadas", color: "var(--tinta-2)", valores: porDia.map((d) => d.total) },
                { nombre: "Pasaron a una persona", color: "var(--laton)", valores: porDia.map((d) => d.escaladas) },
              ]}
              etiquetas={etiquetasDias}
              titulos={porDia.map((d) => fechaLarga(`${d.dia}T12:00:00Z`, "UTC"))}
              alto={210}
            />
          </section>

          <section aria-label={agenda ? "Lo que viene" : pedidos ? "Por sacar" : "Recados por regresar"} className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-linea bg-panel">
            <header className="flex items-baseline justify-between gap-4 border-b border-linea px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-tinta">{agenda ? "Lo que viene" : pedidos ? "Por sacar" : "Recados por regresar"}</h2>
                <p className="mt-0.5 text-[12px] text-tinta-3">
                  {agenda
                    ? proximas.length === 0
                      ? "Ya no hay citas por llegar hoy."
                      : "Las siguientes citas de hoy."
                    : pedidos
                      ? porSacar.length === 0
                        ? "Nada pendiente en cocina."
                        : `${porSacar.length} pedidos sin entregar.`
                      : "Los que aún no regresas."}
                </p>
              </div>
              <Link href={agenda ? "/agenda" : pedidos ? "/pedidos" : "/recados"} className="text-[13px] font-bold whitespace-nowrap text-acento transition-colors duration-150 hover:text-tinta">
                {agenda ? "Abrir la agenda" : pedidos ? "Abrir pedidos" : "Todos"}
              </Link>
            </header>
            {agenda ? (
              proximas.length === 0 ? (
                <VacioHoja titulo={citasHoy.length === 0 ? "Día libre" : "Todas atendidas"} detalle={citasHoy.length === 0 ? "El agente agenda por teléfono; aquí aparecen solas." : undefined} />
              ) : (
                <ul className="divide-y divide-linea">
                  {proximas.map((r) => {
                    const faltanMin = -minutosDesde(r.inicio, ahora);
                    const retraso = faltanMin < 0 ? -faltanMin : 0;
                    return (
                      <FilaLista
                        key={r.id}
                        href={r.cliente_id ? `/clientes/${r.cliente_id}` : "/agenda"}
                        hora={hora(r.inicio, zona)}
                        titulo={r.cliente_nombre}
                        detalle={`${r.servicio} · ${r.recurso}`}
                        estado={
                          <Estampa tono={retraso > MINUTOS_TOLERANCIA ? "critico" : retraso > 0 ? "alerta" : "neutro"} late={retraso > MINUTOS_TOLERANCIA}>
                            {retraso > 0 ? `+${minutosLegibles(retraso)}` : `en ${minutosLegibles(Math.max(0, faltanMin))}`}
                          </Estampa>
                        }
                      />
                    );
                  })}
                </ul>
              )
            ) : pedidos ? (
              porSacar.length === 0 ? (
                <VacioHoja titulo="Sin pedidos pendientes" />
              ) : (
                <ul className="divide-y divide-linea">
                  {porSacar.slice(0, 7).map((p) => (
                    <FilaLista
                      key={p.id}
                      href="/pedidos"
                      hora={p.codigo}
                      titulo={p.cliente_nombre ?? "Sin nombre"}
                      detalle={`${p.items.length} ${p.items.length === 1 ? "cosa" : "cosas"} · ${moneda(p.total)}`}
                      estado={
                        <Estampa tono={p.estado === "abierto" ? "alerta" : "acento"} late={p.estado === "confirmado"}>
                          {p.estado === "abierto" ? "Sin cerrar" : "En cocina"}
                        </Estampa>
                      }
                    />
                  ))}
                </ul>
              )
            ) : listaRecados.length === 0 ? (
              <VacioHoja titulo="Sin recados" />
            ) : (
              <ul className="divide-y divide-linea">
                {listaRecados.slice(0, 7).map((r) => (
                  <FilaLista
                    key={r.id}
                    href="/recados"
                    hora={hora(r.creado, zona)}
                    titulo={r.nombre ?? "Sin nombre"}
                    detalle={`${fechaCorta(r.creado, zona)} · ${r.asunto}`}
                    estado={<span className="numeros text-[12px] text-tinta-2">{telefono(r.telefono)}</span>}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_340px]">
          <section aria-label="Lo último que entró" className="min-w-0 overflow-hidden rounded-lg border border-linea bg-panel">
            <header className="flex items-baseline justify-between gap-4 border-b border-linea px-5 pt-4 pb-3">
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-tinta">Lo último que entró</h2>
                <p className="mt-0.5 text-[12px] text-tinta-3">Por teléfono, WhatsApp y redes.</p>
              </div>
              <Link href="/bandeja" className="text-[13px] font-bold whitespace-nowrap text-acento transition-colors duration-150 hover:text-tinta">
                Abrir mensajes
              </Link>
            </header>
            {hilos.length === 0 ? (
              <VacioHoja titulo="Todavía nadie escribe" />
            ) : (
              <div className="divide-y divide-linea">
                {hilos.map((c) => (
                  <RenglonConversacion key={c.id} conversacion={c} zona={zona} />
                ))}
              </div>
            )}
          </section>

          <section aria-label="Sugerencias" className="min-w-0 overflow-hidden rounded-lg border border-linea bg-panel">
            <header className="border-b border-linea px-5 pt-4 pb-3">
              <h2 className="text-[15px] font-bold tracking-tight text-tinta">Sugerencias</h2>
              <p className="mt-0.5 text-[12px] text-tinta-3">Se calculan con lo que hay en Clientes y Cobros.</p>
            </header>
            {insights.length > 0 ? (
              <ul className="divide-y divide-linea">
                {insights.map((s) => (
                  <li key={s.id} className="px-5 py-3.5">
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] leading-snug text-tinta-2">{s.titulo}</p>
                        <p className="mt-1.5 flex items-baseline gap-2">
                          <span className="numeros text-[22px] leading-none font-bold tracking-[-0.01em] text-tinta">{s.cifra}</span>
                          {s.unidad ? <span className="text-[12px] text-tinta-3">{s.unidad}</span> : null}
                        </p>
                        {s.variacion ? (
                          <p className={`numeros mt-1 text-[11.5px] ${s.variacion.tono === "critico" ? "text-critico" : s.variacion.tono === "alerta" ? "text-alerta" : s.variacion.tono === "bueno" ? "text-bueno" : "text-tinta-3"}`}>
                            {s.variacion.texto}
                          </p>
                        ) : null}
                      </div>
                      <Chispa serie={s.serie} alto={40} className="h-10 w-28 flex-none" />
                    </div>
                    {s.nota ? <p className="mt-2 text-[12px] leading-relaxed text-tinta-3">{s.nota}</p> : null}
                    {s.accion?.href ? (
                      <Link href={s.accion.href} className="mt-2.5 inline-flex h-8 items-center rounded-lg bg-acento px-3 text-[13px] font-semibold text-acento-tinta transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40">
                        {s.accion.texto}
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-linea">
                {[
                  { texto: "Clientes sin contacto en 90 días", dato: "0", href: "/clientes?ver=inactivos" },
                  ...(agenda ? [{ texto: "Clientes con dos o más faltas", dato: "0", href: "/clientes?ver=faltan" }] : []),
                  { texto: "Pagos pendientes de cobrar", dato: moneda(0), href: "/cobros" },
                ].map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="group flex h-10 items-center gap-3 px-5 transition-colors duration-150 hover:bg-panel-2">
                      <i aria-hidden="true" className="h-1.5 w-1.5 flex-none bg-bueno" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-tinta-2 transition-colors duration-150 group-hover:text-tinta">{r.texto}</span>
                      <span className="numeros text-[12px] text-tinta-3">{r.dato}</span>
                    </Link>
                  </li>
                ))}
                <li className="px-5 py-3">
                  <Estampa tono="bueno">Nada que sugerir hoy</Estampa>
                </li>
              </ul>
            )}
          </section>

          <section aria-label="Cómo les fue" className="min-w-0 overflow-hidden rounded-lg border border-linea bg-panel">
            <header className="border-b border-linea px-5 pt-4 pb-3">
              <h2 className="text-[15px] font-bold tracking-tight text-tinta">Cómo les fue</h2>
              <p className="mt-0.5 text-[12px] text-tinta-3">{promedio === null ? "Se pregunta por WhatsApp después de cada cita." : `${totalResenas} ${totalResenas === 1 ? "calificación" : "calificaciones"} en 30 días.`}</p>
            </header>
            {promedio === null ? (
              <VacioHoja titulo="Sin calificaciones todavía" />
            ) : (
              <div className="px-5 pt-4 pb-5">
                <p className="flex items-baseline gap-2">
                  <span className="numeros text-[34px] leading-none font-bold tracking-[-0.01em] text-tinta">{promedio.toFixed(1)}</span>
                  <span className="text-[13px] text-tinta-3">de 5</span>
                </p>
                <Avance valor={promedio} meta={5} className="mt-3" color={promedio >= 4 ? "var(--bueno)" : "var(--alerta)"} />
                <ul className="mt-4 space-y-3">
                  {resenas.slice(0, 4).map((r) => (
                    <li key={r.resource_id ?? "sin"}>
                      <div className="flex items-center justify-between gap-3 text-[12.5px]">
                        <span className="truncate text-tinta-2">{r.nombre}</span>
                        <span className="numeros text-tinta">{Number(r.promedio).toFixed(1)}</span>
                      </div>
                      <Avance valor={Number(r.promedio)} meta={5} className="mt-1.5" color={Number(r.promedio) >= 4 ? "var(--bueno)" : "var(--alerta)"} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function VacioHoja({ titulo, detalle }: { titulo: string; detalle?: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5 px-5 py-6">
      <p className="flex items-center gap-2 text-[13px] font-medium text-tinta">
        <i aria-hidden="true" className="h-1.5 w-1.5 flex-none bg-tinta-3" />
        {titulo}
      </p>
      {detalle ? <p className="max-w-sm text-[12px] leading-relaxed text-tinta-3">{detalle}</p> : null}
    </div>
  );
}

const SEMANA = 7 * 24 * 60 * 60 * 1000;

/** Cuántos había al cierre de cada una de las últimas ocho semanas: el acumulado que dibuja la chispa. */
function serieSemanal(
  fechas: number[],
  ahora: number,
  peso: (i: number) => number = () => 1,
): number[] {
  return Array.from({ length: 8 }, (_, s) => {
    const corte = ahora - (7 - s) * SEMANA;
    return fechas.reduce(
      (total, f, i) => (f <= corte ? total + peso(i) : total),
      0,
    );
  });
}

function nombres(lista: { nombre: string | null }[]): string {
  const primeros = lista
    .slice(0, 3)
    .map((c) => (c.nombre ?? "Sin nombre").split(/\s+/)[0]);
  const resto = lista.length - primeros.length;
  return resto > 0
    ? `${primeros.join(", ")} y ${resto} más`
    : primeros.join(", ");
}

/** Sugerencias reales, calculadas con clientes y cobros: cada una lleva a donde se resuelve. */
function sugerencias({
  inactivos,
  faltan,
  pendientes,
  ahora,
}: {
  inactivos: Awaited<ReturnType<typeof clientes>>;
  faltan: Awaited<ReturnType<typeof clientes>>;
  pendientes: Awaited<ReturnType<typeof pagosPendientes>>;
  ahora: number;
}): Insight[] {
  const lista: Insight[] = [];
  const DIA = SEMANA / 7;

  const conHistorial = inactivos.filter(
    (c) => c.atendidas > 0 || c.pedidos > 0,
  );
  if (conHistorial.length > 0) {
    const serie = serieSemanal(
      conHistorial.map((c) => new Date(c.ultimo_contacto).getTime() + 90 * DIA),
      ahora,
    );
    const nuevos = serie[7]! - serie[0]!;
    lista.push({
      id: "inactivos",
      titulo: "Clientes que ya vinieron y llevan más de 90 días sin contacto",
      cifra: String(conHistorial.length),
      unidad: conHistorial.length === 1 ? "cliente" : "clientes",
      variacion:
        nuevos > 0
          ? { texto: `+${nuevos} en 8 semanas`, tono: "alerta" }
          : { texto: "sin cambios en 8 semanas", tono: "neutro" },
      serie,
      nota: `${nombres(conHistorial)}. Una campaña por WhatsApp los invita a volver sin que nadie marque.`,
      accion: { texto: "Ver inactivos", href: "/clientes?ver=inactivos" },
    });
  }

  const repetidas = faltan.filter((c) => c.no_asistio >= 2);
  if (repetidas.length > 0) {
    const serie = serieSemanal(
      repetidas.map((c) => new Date(c.ultimo_contacto).getTime()),
      ahora,
    );
    lista.push({
      id: "faltas",
      titulo: "Clientes con dos o más citas a las que no llegaron",
      cifra: String(repetidas.length),
      unidad: repetidas.length === 1 ? "cliente" : "clientes",
      variacion: {
        texto: `${repetidas.reduce((s, c) => s + c.no_asistio, 0)} faltas en total`,
        tono: "critico",
      },
      serie,
      nota: `${nombres(repetidas)}. Conviene confirmarles un día antes o pedir anticipo al agendar.`,
      accion: { texto: "Ver quiénes faltan", href: "/clientes?ver=faltan" },
    });
  }

  if (pendientes.length > 0) {
    const monto = pendientes.reduce((s, p) => s + Number(p.monto), 0);
    const serie = serieSemanal(
      pendientes.map((p) => new Date(p.creado).getTime()),
      ahora,
      (i) => Number(pendientes[i]!.monto),
    );
    const viejos = pendientes.filter(
      (p) => ahora - new Date(p.creado).getTime() > 7 * DIA,
    ).length;
    lista.push({
      id: "cobros",
      titulo: "Dinero que ya se debía haber cobrado",
      cifra: moneda(monto),
      unidad: `en ${pendientes.length} ${pendientes.length === 1 ? "pago" : "pagos"}`,
      variacion:
        viejos > 0
          ? { texto: `${viejos} con más de una semana`, tono: "alerta" }
          : { texto: "todos de esta semana", tono: "neutro" },
      serie,
      nota: "Un recordatorio por WhatsApp con el enlace de pago cobra sin que nadie llame.",
      accion: { texto: "Ir a cobros", href: "/cobros" },
    });
  }

  return lista;
}

function ParaEmpezar({
  progreso,
  giro,
}: {
  progreso: Awaited<ReturnType<typeof avance>>;
  giro: string;
}) {
  const faltantes = progreso.requisitos.filter((r) => !r.listo);
  return (
    <>
      <Encabezado
        titulo="Para empezar"
        descripcion="Cuando esto esté completo, el agente contesta y aquí vas a ver cómo va el día."
        giro={giro}
      />
      <div className="px-5 py-5">
        <Tarjeta className="max-w-2xl">
          <TarjetaCabecera
            titulo={
              progreso.completo
                ? "Solo falta el número"
                : `Faltan ${faltantes.length} de ${progreso.total}`
            }
            descripcion="Cada paso toma unos minutos. Puedes hacerlos en el orden que quieras."
          />
          <ol className="divide-y divide-linea">
            {progreso.requisitos.map((r, i) => (
              <li key={r.clave} className="flex items-center gap-4 px-4 py-3">
                <span
                  className={`flex h-7 w-7 flex-none items-center justify-center text-[12px] ${r.listo ? "bg-bueno text-white" : "bg-panel-2 text-tinta-2"}`}
                >
                  {r.listo ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[14px] font-medium ${r.listo ? "text-tinta-3 line-through" : "text-tinta"}`}
                  >
                    {r.nombre}
                  </p>
                  <p className="text-[12px] text-tinta-3">{r.ayuda}</p>
                </div>
                {r.listo ? null : (
                  <Link
                    href={r.ruta}
                    className="inline-flex h-8 items-center bg-acento px-3 text-[13px] font-medium text-acento-tinta transition hover:brightness-110"
                  >
                    Hacerlo
                  </Link>
                )}
              </li>
            ))}
            {progreso.completo && !progreso.tieneNumero ? (
              <li className="flex items-center gap-4 px-4 py-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center bg-panel-2 text-[12px] text-tinta-2">
                  {progreso.total + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-tinta">
                    Número de entrada
                  </p>
                  <p className="text-[12px] text-tinta-3">
                    El teléfono al que van a llamar tus clientes. Al guardarlo,
                    el agente empieza a contestar.
                  </p>
                </div>
                <Link
                  href="/agente"
                  className="inline-flex h-8 items-center bg-acento px-3 text-[13px] font-medium text-acento-tinta transition hover:brightness-110"
                >
                  Ponerlo
                </Link>
              </li>
            ) : null}
          </ol>
        </Tarjeta>
      </div>
    </>
  );
}
