import Link from "next/link";
import { RenglonConversacion } from "@/components/renglon-conversacion";
import { Encabezado } from "@/components/encabezado";
import { GraficaLlamadas } from "@/components/graficas";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { Insignia, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { MINUTOS_TOLERANCIA, minutosDesde, minutosLegibles } from "@/components/flujo-citas";
import {
  alertasHoy,
  conversaciones,
  llamadasPorDia,
  negocio,
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

  const [alertas, hilos, llamadas7, porDia, cobros, resenas, reservas, listaPedidos, listaRecados] = await Promise.all([
    alertasHoy(),
    conversaciones(6),
    resumenLlamadas(7),
    llamadasPorDia(7),
    resumenCobros(hoy),
    resenasResumen(30),
    agenda ? reservasEntre(hoy, hoy) : Promise.resolve([]),
    pedidos ? pedidosDelDia(hoy) : Promise.resolve([]),
    !agenda && !pedidos ? recados(true) : Promise.resolve([]),
  ]);
  const ahora = Date.now();
  const horaLocal = Number(new Intl.DateTimeFormat("es-MX", { hour: "numeric", hour12: false, timeZone: zona }).format(new Date()));
  const saludo = horaLocal < 12 ? "Buenos días" : horaLocal < 19 ? "Buenas tardes" : "Buenas noches";
  const { citas: citasHoy, atendidas, enAtencion, porLlegar } = resumenCitas(reservas);
  const proximas = porLlegar.slice(0, 6);
  const porSacar = listaPedidos.filter((p) => p.estado === "abierto" || p.estado === "confirmado");
  const sinLeer = alertas.mensajes_sin_leer;
  const totalResenas = resenas.reduce((s, r) => s + r.total, 0);
  const promedio = totalResenas > 0 ? resenas.reduce((s, r) => s + Number(r.promedio) * r.total, 0) / totalResenas : null;
  const contencion = llamadas7.total > 0 ? llamadas7.resueltas / llamadas7.total : null;

  const avisos: { texto: string; href: string; tono: "critico" | "alerta" | "acento" }[] = [];
  if (alertas.retrasadas > 0) avisos.push({ texto: `${alertas.retrasadas} ${alertas.retrasadas === 1 ? "persona lleva" : "personas llevan"} más de 15 minutos de retraso`, href: "/agenda?filtro=retrasadas", tono: "critico" });
  if (alertas.escaladas > 0) avisos.push({ texto: `${alertas.escaladas} ${alertas.escaladas === 1 ? "conversación pidió" : "conversaciones pidieron"} una persona`, href: "/bandeja", tono: "alerta" });
  if (alertas.recados > 0) avisos.push({ texto: `${alertas.recados} ${alertas.recados === 1 ? "recado espera" : "recados esperan"} que le marques`, href: "/recados", tono: "alerta" });
  if (alertas.por_cobrar_atendidas > 0) avisos.push({ texto: `${alertas.por_cobrar_atendidas} ${alertas.por_cobrar_atendidas === 1 ? "cita atendida hoy sin cobro registrado" : "citas atendidas hoy sin cobro registrado"}`, href: "/agenda", tono: "alerta" });
  if (alertas.cobros_pendientes > 0) avisos.push({ texto: `${moneda(alertas.cobros_monto)} por cobrar en ${alertas.cobros_pendientes} ${alertas.cobros_pendientes === 1 ? "pago pendiente" : "pagos pendientes"}`, href: "/cobros", tono: "alerta" });
  if (alertas.campanas_contestaron > 0) avisos.push({ texto: `${alertas.campanas_contestaron} ${alertas.campanas_contestaron === 1 ? "persona contestó" : "personas contestaron"} a una campaña`, href: "/campanas", tono: "acento" });

  return (
    <>
      <Encabezado titulo="Hoy" descripcion={`${saludo}. ${fechaLarga(`${hoy}T12:00:00Z`, "UTC")} · así va el día.`} giro={giro.nombre} />
      <div className="space-y-4 px-5 py-5">
        {avisos.length > 0 ? (
          <section aria-label="Necesita atención" className="border border-linea bg-panel">
            <div className="flex items-center gap-2 px-4 pt-3 pb-1">
              <i className="cuadrado" aria-hidden="true" />
              <h2 className="text-[13px] font-semibold text-tinta">Necesita atención</h2>
            </div>
            <ul className="divide-y divide-linea">
              {avisos.map((a) => (
                <li key={a.texto}>
                  <Link
                    href={a.href}
                    className={`flex items-center gap-3 border-l-[3px] px-4 py-2.5 transition hover:bg-panel-2 ${
                      a.tono === "critico" ? "border-critico" : a.tono === "alerta" ? "border-alerta" : "border-acento"
                    }`}
                  >
                    <Insignia tono={a.tono}>{a.tono === "critico" ? "Urgente" : a.tono === "alerta" ? "Pendiente" : "Novedad"}</Insignia>
                    <span className="flex-1 text-[13px] text-tinta">{a.texto}</span>
                    <span className="text-[12px] text-tinta-3">Ver →</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="border border-linea bg-panel px-4 py-3 text-[13px] text-tinta-2">
            <span className="mr-2 inline-block h-2 w-2 bg-bueno align-middle" aria-hidden="true" />
            Nada pendiente. Todo lo de hoy está en orden.
          </p>
        )}

        <TiraIndicadores>
          {agenda ? (
            <Cifra
              etiqueta="Citas de hoy"
              valor={String(citasHoy.length)}
              unidad={`${atendidas} atendidas`}
              glifo={Glifos.personas}
              pildora={enAtencion.length > 0 ? `${enAtencion.length} en atención` : undefined}
              tono="neutro"
            />
          ) : null}
          {pedidos ? (
            <Cifra etiqueta="Pedidos de hoy" valor={String(listaPedidos.length)} unidad={`${porSacar.length} por sacar`} glifo={Glifos.personas} tono={porSacar.length > 0 ? "alerta" : "bueno"} pildora={porSacar.length > 0 ? "en cocina" : "al día"} />
          ) : null}
          <Cifra etiqueta="Cobrado hoy" valor={moneda(cobros.cobrado)} glifo={Glifos.dinero} pildora={`${cobros.operaciones} cobros`} tono="bueno" />
          <Cifra
            etiqueta="Mensajes sin leer"
            valor={String(sinLeer)}
            glifo={Glifos.llamada}
            pildora={alertas.escaladas > 0 ? `${alertas.escaladas} piden persona` : undefined}
            tono={alertas.escaladas > 0 ? "alerta" : "neutro"}
          />
          <Cifra
            etiqueta="Llamadas en 7 días"
            valor={String(llamadas7.total)}
            glifo={Glifos.llamada}
            pildora={contencion === null ? undefined : `${porcentaje(contencion)} resueltas solas`}
            tono={contencion === null ? "neutro" : contencion >= 0.75 ? "bueno" : "alerta"}
          />
        </TiraIndicadores>

        <div className="grid gap-4 xl:grid-cols-2">
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
                      <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-panel-2">
                        <span className="numeros w-[72px] font-mono text-[12.5px] font-medium text-tinta">{hora(r.inicio, zona)}</span>
                        <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center bg-acento-suave font-mono text-[10.5px] font-medium text-acento">
                          {iniciales(r.cliente_nombre)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-tinta">
                            {r.cliente_id ? <Link href={`/clientes/${r.cliente_id}`} className="transition hover:text-acento">{r.cliente_nombre}</Link> : r.cliente_nombre}
                          </p>
                          <p className="truncate text-[11.5px] text-tinta-3">{r.servicio} · {r.recurso}</p>
                        </div>
                        <span className={`numeros px-1.5 py-0.5 font-mono text-[11px] ${retraso > MINUTOS_TOLERANCIA ? "bg-critico/12 text-critico" : retraso > 0 ? "bg-alerta/12 text-alerta" : "bg-panel-2 text-tinta-2"}`}>
                          {retraso > 0 ? `+${minutosLegibles(retraso)}` : `en ${minutosLegibles(Math.max(0, faltan))}`}
                        </span>
                      </li>
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
                    <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-panel-2">
                      <span className="numeros flex h-8 min-w-[56px] items-center justify-center bg-tinta px-2 font-mono text-[12px] font-bold tracking-wider text-paper">{p.codigo}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-tinta">{p.cliente_nombre ?? "Sin nombre"}</p>
                        <p className="truncate text-[11.5px] text-tinta-3">{p.items.length} {p.items.length === 1 ? "cosa" : "cosas"} · {moneda(p.total)}</p>
                      </div>
                      <Insignia tono={p.estado === "abierto" ? "alerta" : "acento"}>{p.estado === "abierto" ? "Sin cerrar" : "En cocina"}</Insignia>
                    </li>
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
                    <li key={r.id} className="flex items-center gap-4 px-4 py-2.5">
                      <span className="numeros w-[100px] font-mono text-[12px] text-tinta-3">{fechaCorta(r.creado, zona)} {hora(r.creado, zona)}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-tinta">{r.nombre ?? "Sin nombre"} · {r.asunto}</span>
                      <span className="numeros font-mono text-[12px] text-tinta-2">{telefono(r.telefono)}</span>
                    </li>
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
