import Link from "next/link";
import { Encabezado } from "@/components/encabezado";
import { Cifra, Glifos, TiraIndicadores } from "@/components/indicadores";
import { GraficaHoras, GraficaLlamadas, GraficaMotivos } from "@/components/graficas";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import {
  clientesPorOrigen,
  resenasResumen,
  llamadasPorDia,
  llamadasPorHora,
  motivosEscalamiento,
  negocio,
  recadosPendientes,
  resumenAgendaHoy,
  resumenLlamadas,
  resumenPedidos,
} from "@/lib/consultas";
import { duracion, isoDia, moneda, porcentaje } from "@/lib/formato";
import { contexto } from "@/lib/sesion";

const RANGOS = [7, 14, 30] as const;

export default async function Resumen({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const parametros = await searchParams;
  const dias = RANGOS.find((r) => String(r) === parametros.dias) ?? 14;
  const { giro } = await contexto();

  const [config, resumen, porDia, motivos, porHora, resenas, origenes] = await Promise.all([
    negocio(),
    resumenLlamadas(dias),
    llamadasPorDia(dias),
    motivosEscalamiento(dias),
    llamadasPorHora(dias),
    resenasResumen(dias),
    clientesPorOrigen(dias),
  ]);
  const totalResenas = resenas.reduce((s, r) => s + r.total, 0);
  const promedioGeneral = totalResenas > 0 ? resenas.reduce((s, r) => s + Number(r.promedio) * r.total, 0) / totalResenas : 0;

  const hoy = isoDia(new Date(), config.zona_horaria);
  const containment = resumen.total > 0 ? resumen.resueltas / resumen.total : 0;
  const escalamiento = resumen.total > 0 ? resumen.escaladas / resumen.total : 0;

  return (
    <>
      <Encabezado
        titulo="Resumen"
        descripcion={`${config.nombre} · últimos ${dias} días`}
        giro={giro.nombre}
        acciones={
          <div className="flex border border-linea bg-panel">
            {RANGOS.map((r) => (
              <Link
                key={r}
                href={`/resumen?dias=${r}`}
                className={`px-2.5 py-1.5 text-[12px] transition ${
                  r === dias ? "bg-tinta font-medium text-paper" : "text-tinta-2 hover:bg-panel-2"
                }`}
              >
                {r} d
              </Link>
            ))}
          </div>
        }
      />

      <div className="space-y-4 px-5 py-5">
        <Hoy herramientas={giro.herramientas} dia={hoy} />

        <TiraIndicadores>
          <Cifra
            etiqueta="Llamadas"
            valor={String(resumen.total)}
            glifo={Glifos.llamada}
            pildora={`${(resumen.total / dias).toFixed(1)} por día`}
          />
          <Cifra
            etiqueta="Resueltas sin humano"
            valor={porcentaje(containment)}
            glifo={Glifos.personas}
            pildora={`${resumen.resueltas} de ${resumen.total}`}
            tono={containment >= 0.75 ? "bueno" : containment >= 0.5 ? "alerta" : "critico"}
          />
          <Cifra
            etiqueta="Escalamiento"
            valor={porcentaje(escalamiento)}
            glifo={Glifos.alerta}
            pildora={`${resumen.escaladas} a una persona`}
            tono={escalamiento <= 0.15 ? "bueno" : escalamiento <= 0.3 ? "alerta" : "critico"}
          />
          <Cifra etiqueta="Duración promedio" valor={duracion(resumen.duracionPromedio)} unidad="min" glifo={Glifos.reloj} />
        </TiraIndicadores>

        <Tarjeta>
          <TarjetaCabecera
            titulo="Llamadas por día"
            descripcion="Cada columna es un día. El azul se resolvió solo; el naranja pasó a una persona."
          />
          {resumen.total === 0 ? (
            <Vacio
              titulo="Todavía no hay llamadas registradas"
              detalle="En cuanto el agente conteste la primera llamada, aquí verás el volumen diario y qué tanto se resuelve sin intervención."
            />
          ) : (
            <GraficaLlamadas datos={porDia} />
          )}
        </Tarjeta>

        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta>
            <TarjetaCabecera titulo="Por qué se escala" descripcion="Motivos más frecuentes de transferencia." />
            {motivos.length === 0 ? (
              <Vacio titulo="Sin escalamientos en el periodo" detalle="El agente resolvió todas las llamadas registradas." />
            ) : (
              <GraficaMotivos datos={motivos} />
            )}
          </Tarjeta>

          <Tarjeta>
            <TarjetaCabecera titulo="A qué hora te llaman" descripcion={`Hora local de ${config.zona_horaria}.`} />
            {resumen.total === 0 ? (
              <Vacio titulo="Sin datos de horario" />
            ) : (
              <GraficaHoras datos={porHora} />
            )}
          </Tarjeta>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Tarjeta>
            <TarjetaCabecera
              titulo="Cómo les fue"
              descripcion={totalResenas > 0 ? `${totalResenas} calificaciones · promedio ${promedioGeneral.toFixed(1)} de 5` : "Se pregunta por WhatsApp después de cada cita atendida."}
            />
            {resenas.length === 0 ? (
              <Vacio titulo="Sin calificaciones todavía" detalle="Activa las reseñas en Agente y pon tu liga de Google." />
            ) : (
              <ul className="divide-y divide-linea">
                {resenas.map((r) => (
                  <li key={r.resource_id ?? "sin"} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] text-tinta">{r.nombre}</span>
                    <span className="numeros font-mono text-[12px] text-tinta-3">{r.total}</span>
                    <span className={`numeros font-mono text-[14px] font-medium ${Number(r.promedio) >= 4 ? "text-bueno" : Number(r.promedio) >= 3 ? "text-alerta" : "text-critico"}`}>
                      {Number(r.promedio).toFixed(1)}
                    </span>
                    {r.bajas > 0 ? <span className="bg-critico/12 px-1.5 py-0.5 font-mono text-[10px] text-critico">{r.bajas} bajas</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Tarjeta>
          <Tarjeta>
            <TarjetaCabecera titulo="De dónde vienen" descripcion="Clientes nuevos del periodo según el número al que marcaron o el canal por el que escribieron." />
            {origenes.length === 0 ? (
              <Vacio titulo="Sin clientes nuevos en el periodo" />
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-linea">
                    <th className="etiqueta px-4 py-2 text-left font-normal">Origen</th>
                    <th className="etiqueta px-4 py-2 text-right font-normal">Clientes</th>
                    <th className="etiqueta px-4 py-2 text-right font-normal">Citas</th>
                    <th className="etiqueta px-4 py-2 text-right font-normal">Cobrado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-linea">
                  {origenes.map((o) => (
                    <tr key={o.origen}>
                      <td className="px-4 py-2 text-tinta">{o.origen}</td>
                      <td className="numeros px-4 py-2 text-right font-mono">{o.clientes}</td>
                      <td className="numeros px-4 py-2 text-right font-mono">{o.citas}</td>
                      <td className="numeros px-4 py-2 text-right font-mono">{moneda(o.cobrado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Tarjeta>
        </div>
      </div>
    </>
  );
}

async function Hoy({ herramientas, dia }: { herramientas: string[]; dia: string }) {
  if (herramientas.includes("pedido")) {
    const pedidos = await resumenPedidos(dia);
    return (
      <Bloque titulo="Hoy" ruta="/pedidos" enlace="Ver pedidos" columnas={4}>
        <Cifra etiqueta="Pedidos del día" valor={String(pedidos.total)} glifo={Glifos.personas} pildora={`${pedidos.cancelados} cancelados`} />
        <Cifra
          etiqueta="Por sacar"
          valor={String(pedidos.abiertos + pedidos.confirmados)}
          glifo={Glifos.reloj}
          pildora={`${pedidos.entregados} ya salieron`}
          tono={pedidos.abiertos + pedidos.confirmados > 0 ? "alerta" : "bueno"}
        />
        <Cifra etiqueta="Total vendido" valor={moneda(pedidos.vendido)} glifo={Glifos.dinero} pildora="confirmados y entregados" />
        <Cifra etiqueta="Ticket promedio" valor={moneda(pedidos.ticket)} glifo={Glifos.dinero} pildora="por pedido cerrado" />
      </Bloque>
    );
  }

  if (herramientas.includes("agendar")) {
    const agenda = await resumenAgendaHoy(dia);
    return (
      <Bloque titulo="Hoy" ruta="/agenda" enlace="Ver agenda" columnas={3}>
        <Cifra etiqueta="Citas confirmadas" valor={String(agenda.confirmadas)} unidad="para hoy" glifo={Glifos.personas} />
        <Cifra etiqueta="Personas esperadas" valor={String(agenda.personas)} glifo={Glifos.personas} pildora="suma de las confirmadas" />
        <Cifra
          etiqueta="Canceladas"
          valor={String(agenda.canceladas)}
          glifo={Glifos.alerta}
          pildora={agenda.canceladas > 0 ? "horario liberado" : "ninguna"}
          tono={agenda.canceladas > 0 ? "alerta" : "bueno"}
        />
      </Bloque>
    );
  }

  const pendientes = await recadosPendientes();
  return (
    <Bloque titulo="Bandeja" ruta="/recados" enlace="Ver recados" columnas={1}>
      <Cifra
        etiqueta="Recados sin atender"
        valor={String(pendientes)}
        glifo={Glifos.llamada}
        pildora="esperan que les marquen"
        tono={pendientes > 0 ? "alerta" : "bueno"}
      />
    </Bloque>
  );
}

const REJILLA: Record<number, string> = {
  1: "grid-cols-1",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
};

function Bloque({
  titulo,
  ruta,
  enlace,
  columnas,
  children,
}: {
  titulo: string;
  ruta: string;
  enlace: string;
  columnas: number;
  children: React.ReactNode;
}) {
  return (
    <Tarjeta className="overflow-hidden">
      <TarjetaCabecera
        titulo={titulo}
        accion={
          <Link href={ruta} className="text-xs text-tinta-3 transition hover:text-acento">
            {enlace}
          </Link>
        }
      />
      <div className={`grid gap-px bg-linea ${REJILLA[columnas] ?? REJILLA[4]}`}>{children}</div>
    </Tarjeta>
  );
}
