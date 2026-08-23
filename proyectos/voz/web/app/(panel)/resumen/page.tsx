import Link from "next/link";
import { Encabezado, Indicador } from "@/components/encabezado";
import { GraficaHoras, GraficaLlamadas, GraficaMotivos } from "@/components/graficas";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import {
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

  const [config, resumen, porDia, motivos, porHora] = await Promise.all([
    negocio(),
    resumenLlamadas(dias),
    llamadasPorDia(dias),
    motivosEscalamiento(dias),
    llamadasPorHora(dias),
  ]);

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
          <div className="flex overflow-hidden rounded-md border border-linea bg-panel">
            {RANGOS.map((r) => (
              <Link
                key={r}
                href={`/resumen?dias=${r}`}
                className={`px-2.5 py-1 text-xs transition ${
                  r === dias ? "bg-acento-suave font-medium text-acento" : "text-tinta-2 hover:bg-panel-2"
                }`}
              >
                {r} d
              </Link>
            ))}
          </div>
        }
      />

      <div className="space-y-4 px-6 py-5">
        <Hoy herramientas={giro.herramientas} dia={hoy} />

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-linea bg-linea lg:grid-cols-4">
          <Indicador etiqueta="Llamadas" valor={String(resumen.total)} detalle={`${(resumen.total / dias).toFixed(1)} por día`} />
          <Indicador
            etiqueta="Resueltas sin humano"
            valor={porcentaje(containment)}
            detalle={`${resumen.resueltas} de ${resumen.total}`}
            tono={containment >= 0.75 ? "bueno" : containment >= 0.5 ? "alerta" : "critico"}
          />
          <Indicador
            etiqueta="Escalamiento"
            valor={porcentaje(escalamiento)}
            detalle={`${resumen.escaladas} pasaron a una persona`}
            tono={escalamiento <= 0.15 ? "bueno" : escalamiento <= 0.3 ? "alerta" : "critico"}
          />
          <Indicador etiqueta="Duración promedio" valor={duracion(resumen.duracionPromedio)} detalle="minutos por llamada" />
        </div>

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
      </div>
    </>
  );
}

async function Hoy({ herramientas, dia }: { herramientas: string[]; dia: string }) {
  if (herramientas.includes("pedido")) {
    const pedidos = await resumenPedidos(dia);
    return (
      <Bloque titulo="Hoy" ruta="/pedidos" enlace="Ver pedidos" columnas={4}>
        <Indicador etiqueta="Pedidos del día" valor={String(pedidos.total)} detalle={`${pedidos.cancelados} cancelados`} />
        <Indicador
          etiqueta="Por sacar"
          valor={String(pedidos.abiertos + pedidos.confirmados)}
          detalle={`${pedidos.entregados} ya salieron`}
          tono={pedidos.abiertos + pedidos.confirmados > 0 ? "alerta" : "bueno"}
        />
        <Indicador etiqueta="Total vendido" valor={moneda(pedidos.vendido)} detalle="confirmados y entregados" />
        <Indicador etiqueta="Ticket promedio" valor={moneda(pedidos.ticket)} detalle="por pedido cerrado" />
      </Bloque>
    );
  }

  if (herramientas.includes("agendar")) {
    const agenda = await resumenAgendaHoy(dia);
    return (
      <Bloque titulo="Hoy" ruta="/agenda" enlace="Ver agenda" columnas={3}>
        <Indicador etiqueta="Reservas confirmadas" valor={String(agenda.confirmadas)} detalle="para hoy" />
        <Indicador etiqueta="Personas esperadas" valor={String(agenda.personas)} detalle="suma de las confirmadas" />
        <Indicador
          etiqueta="Canceladas"
          valor={String(agenda.canceladas)}
          detalle="se liberó el horario"
          tono={agenda.canceladas > 0 ? "alerta" : undefined}
        />
      </Bloque>
    );
  }

  const pendientes = await recadosPendientes();
  return (
    <Bloque titulo="Bandeja" ruta="/recados" enlace="Ver recados" columnas={1}>
      <Indicador
        etiqueta="Recados sin atender"
        valor={String(pendientes)}
        detalle="gente esperando que le marquen"
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
