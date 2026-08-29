import Link from "next/link";
import { RenglonConversacion } from "@/components/renglon-conversacion";
import { Encabezado } from "@/components/encabezado";
import { GraficaLlamadas } from "@/components/graficas";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { MINUTOS_TOLERANCIA, minutosDesde, minutosLegibles } from "@/components/flujo-citas";
import { TarjetaInsight, type Insight } from "@/components/kit";
import { Estampa, FilaAviso, FilaLista, FilasAviso } from "@/components/kit/operacion";
import {
  alertasHoy,
  clientes,
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
import { fechaCorta, fechaLarga, hora, iniciales, isoDia, moneda, porcentaje, telefono } from "@/lib/formato";
import { avance } from "@/lib/listo";
import { contexto } from "@/lib/sesion";
import { resumenCitas } from "@/lib/tipos";

/**
 * El tablero de inicio: qué necesita atención, cómo va el día en cuatro
 * cifras, lo que viene y lo último que entró. Para operar el día se va a
 * Agenda o a Pedidos; aquí se mira.
 */
export default async function Hoy() {
  const { giro } = await contexto();
  const [config, progreso] = await Promise.all([negocio(), avance(giro.herramientas)]);
  const hoy = isoDia(new Date(), config.zona_horaria);
  const zona = config.zona_horaria;
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");

  if (!progreso.completo || !progreso.tieneNumero) return <ParaEmpezar progreso={progreso} giro={giro.nombre} />;

  const [alertas, hilos, llamadas7, porDia, cobros, resenas, reservas, listaPedidos, listaRecados, inactivos, faltan, pendientes] = await Promise.all([
    alertasHoy(),
    conversaciones(6),
    resumenLlamadas(7),
    llamadasPorDia(7),
    resumenCobros(hoy),
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
  const proximas = porLlegar.slice(0, 6);
  const porSacar = listaPedidos.filter((p) => p.estado === "abierto" || p.estado === "confirmado");
  const sinLeer = alertas.mensajes_sin_leer;
  const totalResenas = resenas.reduce((s, r) => s + r.total, 0);
  const promedio = totalResenas > 0 ? resenas.reduce((s, r) => s + Number(r.promedio) * r.total, 0) / totalResenas : null;
  const contencion = llamadas7.total > 0 ? llamadas7.resueltas / llamadas7.total : null;

  const avisos: { texto: string; href: string; tono: "critico" | "alerta" | "acento"; dato?: string }[] = [];
  if (alertas.retrasadas > 0) avisos.push({ texto: `${alertas.retrasadas === 1 ? "Una persona lleva" : `${alertas.retrasadas} personas llevan`} más de 15 minutos de retraso`, href: "/agenda?filtro=retrasadas", tono: "critico", dato: `${alertas.retrasadas}` });
  if (alertas.escaladas > 0) avisos.push({ texto: `${alertas.escaladas === 1 ? "Una conversación pidió" : `${alertas.escaladas} conversaciones pidieron`} una persona`, href: "/bandeja", tono: "alerta", dato: `${alertas.escaladas}` });
  if (alertas.recados > 0) avisos.push({ texto: `${alertas.recados === 1 ? "Un recado espera" : `${alertas.recados} recados esperan`} que le marques`, href: "/recados", tono: "alerta", dato: `${alertas.recados}` });
  if (alertas.por_cobrar_atendidas > 0) avisos.push({ texto: `${alertas.por_cobrar_atendidas === 1 ? "Una cita atendida hoy" : `${alertas.por_cobrar_atendidas} citas atendidas hoy`} sin cobro registrado`, href: "/agenda", tono: "alerta", dato: `${alertas.por_cobrar_atendidas}` });
  if (alertas.cobros_pendientes > 0) avisos.push({ texto: `Por cobrar en ${alertas.cobros_pendientes === 1 ? "un pago pendiente" : `${alertas.cobros_pendientes} pagos pendientes`}`, href: "/cobros", tono: "alerta", dato: moneda(alertas.cobros_monto) });
  if (alertas.campanas_contestaron > 0) avisos.push({ texto: `${alertas.campanas_contestaron === 1 ? "Una persona contestó" : `${alertas.campanas_contestaron} personas contestaron`} a una campaña`, href: "/campanas", tono: "acento", dato: `${alertas.campanas_contestaron}` });

  return (
    <>
      <Encabezado titulo="Hoy" descripcion={`${saludo}. ${fechaLarga(`${hoy}T12:00:00Z`, "UTC")} · así va el día.`} giro={giro.nombre} />
      <div className="space-y-4 px-5 py-5">
        {avisos.length > 0 ? (
          <FilasAviso titulo="Necesita atención">
            {avisos.map((a) => (
              <FilaAviso
                key={a.texto}
                tono={a.tono}
                href={a.href}
                texto={a.texto}
                dato={a.dato}
                rotulo={a.tono === "critico" ? "Urgente" : a.tono === "alerta" ? "Pendiente" : "Novedad"}
              />
            ))}
          </FilasAviso>
        ) : (
          <p className="flex h-10 items-center gap-3 border border-linea bg-panel px-3 text-[13px] text-tinta-2">
            <i aria-hidden="true" className="h-1.5 w-1.5 bg-bueno" />
            Nada pendiente. Todo lo de hoy está en orden.
            <Estampa tono="bueno">En orden</Estampa>
          </p>
        )}

        <TiraIndicadores>
          {agenda ? (
            <Cifra
              etiqueta="Citas de hoy"
              valor={String(citasHoy.length)}
              numero={citasHoy.length}
              unidad={`${atendidas} atendidas`}
              glifo={Glifos.personas}
              pildora={enAtencion.length > 0 ? `${enAtencion.length} en atención` : undefined}
              tono="neutro"
            />
          ) : null}
          {pedidos ? (
            <Cifra etiqueta="Pedidos de hoy" valor={String(listaPedidos.length)} numero={listaPedidos.length} unidad={`${porSacar.length} por sacar`} glifo={Glifos.personas} tono={porSacar.length > 0 ? "alerta" : "bueno"} pildora={porSacar.length > 0 ? "en cocina" : "al día"} />
          ) : null}
          <Cifra etiqueta="Cobrado hoy" valor={moneda(cobros.cobrado)} numero={Number(cobros.cobrado)} formato="moneda" glifo={Glifos.dinero} pildora={`${cobros.operaciones} cobros`} tono="bueno" />
          <Cifra
            etiqueta="Mensajes sin leer"
            valor={String(sinLeer)}
            numero={sinLeer}
            glifo={Glifos.llamada}
            pildora={alertas.escaladas > 0 ? `${alertas.escaladas} piden persona` : undefined}
            tono={alertas.escaladas > 0 ? "alerta" : "neutro"}
          />
          <Cifra
            etiqueta="Llamadas en 7 días"
            valor={String(llamadas7.total)}
            numero={llamadas7.total}
            glifo={Glifos.llamada}
            pildora={contencion === null ? undefined : `${porcentaje(contencion)} resueltas solas`}
            tono={contencion === null ? "neutro" : contencion >= 0.75 ? "bueno" : "alerta"}
          />
        </TiraIndicadores>

        <div className={`grid gap-4 ${agenda && pedidos ? "xl:grid-cols-2" : "xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_360px]"}`}>
          {agenda ? (
            <Tarjeta>
              <TarjetaCabecera
                titulo="Lo que viene"
                descripcion={proximas.length === 0 ? "Ya no hay citas por llegar hoy." : "Las siguientes citas de hoy."}
                accion={<Link href="/agenda" className="text-xs text-tinta-3 transition hover:text-acento">Abrir la agenda</Link>}
              />
              {proximas.length === 0 ? (
                <Vacio titulo={citasHoy.length === 0 ? "Día libre" : "Todas atendidas"} detalle={citasHoy.length === 0 ? "El agente agenda por teléfono; aquí aparecen solas." : undefined} />
              ) : (
                <ul className="divide-y divide-linea">
                  {proximas.map((r) => {
                    const faltan = -minutosDesde(r.inicio, ahora);
                    const retraso = faltan < 0 ? -faltan : 0;
                    return (
                      <FilaLista
                        key={r.id}
                        href={r.cliente_id ? `/clientes/${r.cliente_id}` : "/agenda"}
                        hora={hora(r.inicio, zona)}
                        iniciales={iniciales(r.cliente_nombre)}
                        titulo={r.cliente_nombre}
                        detalle={`${r.servicio} · ${r.recurso}`}
                        estado={
                          <Estampa tono={retraso > MINUTOS_TOLERANCIA ? "critico" : retraso > 0 ? "alerta" : "neutro"} late={retraso > MINUTOS_TOLERANCIA}>
                            {retraso > 0 ? `+${minutosLegibles(retraso)}` : `en ${minutosLegibles(Math.max(0, faltan))}`}
                          </Estampa>
                        }
                      />
                    );
                  })}
                </ul>
              )}
            </Tarjeta>
          ) : null}

          {pedidos ? (
            <Tarjeta>
              <TarjetaCabecera
                titulo="Por sacar"
                descripcion={porSacar.length === 0 ? "Nada pendiente en cocina." : `${porSacar.length} pedidos sin entregar.`}
                accion={<Link href="/pedidos" className="text-xs text-tinta-3 transition hover:text-acento">Abrir pedidos</Link>}
              />
              {porSacar.length === 0 ? (
                <Vacio titulo="Sin pedidos pendientes" />
              ) : (
                <ul className="divide-y divide-linea">
                  {porSacar.slice(0, 6).map((p) => (
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
              )}
            </Tarjeta>
          ) : null}

          {!agenda && !pedidos ? (
            <Tarjeta>
              <TarjetaCabecera titulo="Recados por regresar" accion={<Link href="/recados" className="text-xs text-tinta-3 transition hover:text-acento">Todos</Link>} />
              {listaRecados.length === 0 ? (
                <Vacio titulo="Sin recados" />
              ) : (
                <ul className="divide-y divide-linea">
                  {listaRecados.slice(0, 6).map((r) => (
                    <FilaLista
                      key={r.id}
                      href="/recados"
                      hora={hora(r.creado, zona)}
                      titulo={r.nombre ?? "Sin nombre"}
                      detalle={`${fechaCorta(r.creado, zona)} · ${r.asunto}`}
                      estado={<span className="numeros font-mono text-[12px] text-tinta-2">{telefono(r.telefono)}</span>}
                    />
                  ))}
                </ul>
              )}
            </Tarjeta>
          ) : null}

          <Tarjeta>
            <TarjetaCabecera
              titulo="Lo último que entró"
              descripcion="Conversaciones por teléfono, WhatsApp y redes."
              accion={<Link href="/bandeja" className="text-xs text-tinta-3 transition hover:text-acento">Abrir mensajes</Link>}
            />
            {hilos.length === 0 ? <Vacio titulo="Todavía nadie escribe" /> : hilos.map((c) => <RenglonConversacion key={c.id} conversacion={c} zona={zona} />)}
          </Tarjeta>

          {insights.length > 0 ? (
            <TarjetaInsight rotulo="Sugerencias" insights={insights} />
          ) : (
            <Tarjeta className="flex flex-col">
              <TarjetaCabecera titulo="Sugerencias" descripcion="Se calculan con lo que hay en Clientes y Cobros." />
              <ul className="divide-y divide-linea">
                {[
                  { texto: "Clientes que ya vinieron y llevan 90 días sin contacto", dato: "0", href: "/clientes?ver=inactivos" },
                  ...(agenda ? [{ texto: "Clientes con dos o más faltas", dato: "0", href: "/clientes?ver=faltan" }] : []),
                  { texto: "Pagos pendientes de cobrar", dato: moneda(0), href: "/cobros" },
                ].map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="group flex h-10 items-center gap-3 px-4 transition-colors duration-150 hover:bg-panel-2">
                      <i aria-hidden="true" className="h-1.5 w-1.5 flex-none bg-bueno" />
                      <span className="min-w-0 flex-1 truncate text-[13px] text-tinta-2 transition-colors duration-150 group-hover:text-tinta">{r.texto}</span>
                      <span className="numeros font-mono text-[12px] text-tinta-3">{r.dato}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="flex flex-1 items-end px-4 py-3">
                <Estampa tono="bueno">Nada que sugerir hoy</Estampa>
              </div>
            </Tarjeta>
          )}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Llamadas de la semana"
              descripcion="Cada columna es un día. El azul lo resolvió el agente; el naranja pasó a una persona."
              accion={<Link href="/resumen" className="text-xs text-tinta-3 transition hover:text-acento">Informe completo</Link>}
            />
            {llamadas7.total === 0 ? <Vacio titulo="Sin llamadas esta semana" /> : <GraficaLlamadas datos={porDia} />}
          </Tarjeta>
          <Tarjeta>
            <TarjetaCabecera titulo="Cómo les fue" descripcion={promedio === null ? "Se pregunta por WhatsApp después de cada cita." : `${totalResenas} calificaciones en 30 días.`} />
            {promedio === null ? (
              <Vacio titulo="Sin calificaciones todavía" />
            ) : (
              <div className="px-4 pb-4">
                <p className="numeros text-[40px] leading-none font-semibold tracking-tight text-tinta">
                  {promedio.toFixed(1)} <span className="text-[16px] font-normal text-tinta-3">de 5</span>
                </p>
                <ul className="mt-3 divide-y divide-linea">
                  {resenas.slice(0, 4).map((r) => (
                    <li key={r.resource_id ?? "sin"} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                      <span className="truncate text-tinta-2">{r.nombre}</span>
                      <span className={`numeros font-mono ${Number(r.promedio) >= 4 ? "text-bueno" : "text-alerta"}`}>{Number(r.promedio).toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

const SEMANA = 7 * 24 * 60 * 60 * 1000;

/** Cuántos había al cierre de cada una de las últimas ocho semanas: el acumulado que dibuja la chispa. */
function serieSemanal(fechas: number[], ahora: number, peso: (i: number) => number = () => 1): number[] {
  return Array.from({ length: 8 }, (_, s) => {
    const corte = ahora - (7 - s) * SEMANA;
    return fechas.reduce((total, f, i) => (f <= corte ? total + peso(i) : total), 0);
  });
}

function nombres(lista: { nombre: string | null }[]): string {
  const primeros = lista.slice(0, 3).map((c) => (c.nombre ?? "Sin nombre").split(/\s+/)[0]);
  const resto = lista.length - primeros.length;
  return resto > 0 ? `${primeros.join(", ")} y ${resto} más` : primeros.join(", ");
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

  const conHistorial = inactivos.filter((c) => c.atendidas > 0 || c.pedidos > 0);
  if (conHistorial.length > 0) {
    const serie = serieSemanal(conHistorial.map((c) => new Date(c.ultimo_contacto).getTime() + 90 * DIA), ahora);
    const nuevos = serie[7]! - serie[0]!;
    lista.push({
      id: "inactivos",
      titulo: "Clientes que ya vinieron y llevan más de 90 días sin contacto",
      cifra: String(conHistorial.length),
      unidad: conHistorial.length === 1 ? "cliente" : "clientes",
      variacion: nuevos > 0 ? { texto: `+${nuevos} en 8 semanas`, tono: "alerta" } : { texto: "sin cambios en 8 semanas", tono: "neutro" },
      serie,
      nota: `${nombres(conHistorial)}. Una campaña por WhatsApp los invita a volver sin que nadie marque.`,
      accion: { texto: "Ver inactivos", href: "/clientes?ver=inactivos" },
    });
  }

  const repetidas = faltan.filter((c) => c.no_asistio >= 2);
  if (repetidas.length > 0) {
    const serie = serieSemanal(repetidas.map((c) => new Date(c.ultimo_contacto).getTime()), ahora);
    lista.push({
      id: "faltas",
      titulo: "Clientes con dos o más citas a las que no llegaron",
      cifra: String(repetidas.length),
      unidad: repetidas.length === 1 ? "cliente" : "clientes",
      variacion: { texto: `${repetidas.reduce((s, c) => s + c.no_asistio, 0)} faltas en total`, tono: "critico" },
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
    const viejos = pendientes.filter((p) => ahora - new Date(p.creado).getTime() > 7 * DIA).length;
    lista.push({
      id: "cobros",
      titulo: "Dinero que ya se debía haber cobrado",
      cifra: moneda(monto),
      unidad: `en ${pendientes.length} ${pendientes.length === 1 ? "pago" : "pagos"}`,
      variacion: viejos > 0 ? { texto: `${viejos} con más de una semana`, tono: "alerta" } : { texto: "todos de esta semana", tono: "neutro" },
      serie,
      nota: "Un recordatorio por WhatsApp con el enlace de pago cobra sin que nadie llame.",
      accion: { texto: "Ir a cobros", href: "/cobros" },
    });
  }

  return lista;
}

function ParaEmpezar({ progreso, giro }: { progreso: Awaited<ReturnType<typeof avance>>; giro: string }) {
  const faltantes = progreso.requisitos.filter((r) => !r.listo);
  return (
    <>
      <Encabezado titulo="Para empezar" descripcion="Cuando esto esté completo, el agente contesta y aquí vas a ver cómo va el día." giro={giro} />
      <div className="px-5 py-5">
        <Tarjeta className="max-w-2xl">
          <TarjetaCabecera
            titulo={progreso.completo ? "Solo falta el número" : `Faltan ${faltantes.length} de ${progreso.total}`}
            descripcion="Cada paso toma unos minutos. Puedes hacerlos en el orden que quieras."
          />
          <ol className="divide-y divide-linea">
            {progreso.requisitos.map((r, i) => (
              <li key={r.clave} className="flex items-center gap-4 px-4 py-3">
                <span className={`flex h-7 w-7 flex-none items-center justify-center font-mono text-[12px] ${r.listo ? "bg-bueno text-white" : "bg-panel-2 text-tinta-2"}`}>
                  {r.listo ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-[14px] font-medium ${r.listo ? "text-tinta-3 line-through" : "text-tinta"}`}>{r.nombre}</p>
                  <p className="text-[12px] text-tinta-3">{r.ayuda}</p>
                </div>
                {r.listo ? null : (
                  <Link href={r.ruta} className="inline-flex h-8 items-center bg-acento px-3 text-[13px] font-medium text-acento-tinta transition hover:brightness-110">
                    Hacerlo
                  </Link>
                )}
              </li>
            ))}
            {progreso.completo && !progreso.tieneNumero ? (
              <li className="flex items-center gap-4 px-4 py-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center bg-panel-2 font-mono text-[12px] text-tinta-2">{progreso.total + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-tinta">Número de entrada</p>
                  <p className="text-[12px] text-tinta-3">El teléfono al que van a llamar tus clientes. Al guardarlo, el agente empieza a contestar.</p>
                </div>
                <Link href="/agente" className="inline-flex h-8 items-center bg-acento px-3 text-[13px] font-medium text-acento-tinta transition hover:brightness-110">
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
