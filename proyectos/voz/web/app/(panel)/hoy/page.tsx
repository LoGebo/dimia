import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { FlujoDelDia } from "@/components/flujo-del-dia";
import { TableroPedidos } from "@/components/tablero-pedidos";
import { Insignia, Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import { alertasHoy, negocio, pagosDePedidos, pedidosDelDia, recados } from "@/lib/consultas";
import { fechaCorta, fechaLarga, hora, isoDia, moneda, telefono } from "@/lib/formato";
import { avance } from "@/lib/listo";
import { contexto } from "@/lib/sesion";

/**
 * La pantalla de todos los días. Primero lo que necesita atención; después,
 * el trabajo del día según el giro. Si el negocio no está listo, solo se ve
 * lo que falta.
 */
export default async function Hoy({ searchParams }: { searchParams: Promise<{ recurso?: string; filtro?: string; orden?: string }> }) {
  const { giro } = await contexto();
  const parametros = await searchParams;
  const [config, progreso] = await Promise.all([negocio(), avance(giro.herramientas)]);
  const hoy = isoDia(new Date(), config.zona_horaria);
  const agenda = giro.herramientas.includes("agendar");
  const pedidos = giro.herramientas.includes("pedido");

  if (!progreso.completo || !progreso.tieneNumero) {
    const faltantes = progreso.requisitos.filter((r) => !r.listo);
    return (
      <>
        <Encabezado titulo="Para empezar" descripcion="Cuando esto esté completo, el agente contesta y aquí vas a ver el día." giro={giro.nombre} />
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

  const alertas = await alertasHoy();
  const avisos: { texto: string; href: string; tono: "critico" | "alerta" | "acento" }[] = [];
  if (alertas.retrasadas > 0) avisos.push({ texto: `${alertas.retrasadas} ${alertas.retrasadas === 1 ? "persona lleva" : "personas llevan"} más de 15 minutos de retraso`, href: "/hoy?filtro=retrasadas", tono: "critico" });
  if (alertas.escaladas > 0) avisos.push({ texto: `${alertas.escaladas} ${alertas.escaladas === 1 ? "conversación pidió" : "conversaciones pidieron"} una persona`, href: "/bandeja", tono: "alerta" });
  if (alertas.recados > 0) avisos.push({ texto: `${alertas.recados} ${alertas.recados === 1 ? "recado espera" : "recados esperan"} que le marques`, href: "/recados", tono: "alerta" });
  if (alertas.por_cobrar_atendidas > 0) avisos.push({ texto: `${alertas.por_cobrar_atendidas} ${alertas.por_cobrar_atendidas === 1 ? "cita atendida hoy sin cobro registrado" : "citas atendidas hoy sin cobro registrado"}`, href: "/hoy", tono: "alerta" });
  if (alertas.cobros_pendientes > 0) avisos.push({ texto: `${moneda(alertas.cobros_monto)} por cobrar en ${alertas.cobros_pendientes} ${alertas.cobros_pendientes === 1 ? "pago pendiente" : "pagos pendientes"}`, href: "/cobros", tono: "alerta" });
  if (alertas.campanas_contestaron > 0) avisos.push({ texto: `${alertas.campanas_contestaron} ${alertas.campanas_contestaron === 1 ? "persona contestó" : "personas contestaron"} a una campaña`, href: "/campanas", tono: "acento" });

  return (
    <>
      <Encabezado
        titulo="Hoy"
        descripcion={`${fechaLarga(`${hoy}T12:00:00Z`, "UTC")} · ${agenda ? "marca Llegó cuando entre cada persona y Atendida al terminar." : pedidos ? "pasa cada pedido a cocina y márcalo entregado al salir." : "marca cada recado cuando lo hayas atendido."}`}
        giro={giro.nombre}
      />
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
                  <Link href={a.href} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-panel-2">
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

        {agenda ? <FlujoDelDia dia={hoy} base="/hoy" parametros={parametros} giro={giro} /> : null}
        {!agenda && pedidos ? <PedidosHoy dia={hoy} zona={config.zona_horaria} /> : null}
        {!agenda && !pedidos ? <RecadosHoy zona={config.zona_horaria} /> : null}
      </div>
    </>
  );
}

async function PedidosHoy({ dia, zona }: { dia: string; zona: string }) {
  const todos = await pedidosDelDia(dia);
  const pendientes = todos.filter((p) => p.estado === "abierto" || p.estado === "confirmado");
  const pagos = await pagosDePedidos(todos.map((p) => p.id));
  const cobrados = new Map(pagos.filter((p) => p.estado === "pagado" && p.pedido_id).map((p) => [p.pedido_id!, p.monto]));
  return (
    <Tarjeta>
      <TarjetaCabecera
        titulo={pendientes.length === 0 ? "Nada por sacar" : `${pendientes.length} por sacar`}
        descripcion={`${todos.length} pedidos hoy · ${todos.filter((p) => p.estado === "entregado").length} entregados`}
        accion={<Link href="/pedidos" className="text-xs text-tinta-3 transition hover:text-acento">Todos los pedidos</Link>}
      />
      {pendientes.length === 0 ? (
        <Vacio titulo="Sin pedidos pendientes" detalle="En cuanto el agente cierre uno por teléfono, aparece aquí." />
      ) : (
        <div className="px-4 pb-4">
          <TableroPedidos pedidos={pendientes} zona={zona} cobrados={cobrados} />
        </div>
      )}
    </Tarjeta>
  );
}

async function RecadosHoy({ zona }: { zona: string }) {
  const lista = await recados(true);
  return (
    <Tarjeta>
      <TarjetaCabecera
        titulo={lista.length === 0 ? "Nada pendiente" : `${lista.length} por regresar la llamada`}
        descripcion="Nombre, teléfono y qué necesita. Márcalo atendido en Recados cuando le llames."
        accion={<Link href="/recados" className="text-xs text-tinta-3 transition hover:text-acento">Todos los recados</Link>}
      />
      {lista.length === 0 ? (
        <Vacio titulo="Sin recados" detalle="Cuando el agente no pueda resolver algo, toma el recado y aparece aquí." />
      ) : (
        <ul className="divide-y divide-linea">
          {lista.slice(0, 12).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
              <span className="numeros w-[100px] font-mono text-[12px] text-tinta-3">{fechaCorta(r.creado, zona)} {hora(r.creado, zona)}</span>
              <span className="min-w-[140px] text-[13px] font-medium text-tinta">{r.nombre ?? "Sin nombre"}</span>
              <span className="numeros font-mono text-[12px] text-tinta-2">{telefono(r.telefono)}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-tinta-2">{r.asunto}</span>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
