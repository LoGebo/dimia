import Link from "next/link";
import { Encabezado, Indicador } from "@/components/encabezado";
import { GraficaHoras, GraficaLlamadas, GraficaMotivos } from "@/components/graficas";
import { Tarjeta, TarjetaCabecera, Vacio } from "@/components/ui/primitivos";
import {
  llamadasPorDia,
  llamadasPorHora,
  motivosEscalamiento,
  negocio,
  resumenLlamadas,
} from "@/lib/consultas";
import { duracion, porcentaje } from "@/lib/formato";

const RANGOS = [7, 14, 30] as const;

export default async function Resumen({
  searchParams,
}: {
  searchParams: Promise<{ dias?: string }>;
}) {
  const parametros = await searchParams;
  const dias = RANGOS.find((r) => String(r) === parametros.dias) ?? 14;

  const [config, resumen, porDia, motivos, porHora] = await Promise.all([
    negocio(),
    resumenLlamadas(dias),
    llamadasPorDia(dias),
    motivosEscalamiento(dias),
    llamadasPorHora(dias),
  ]);

  const containment = resumen.total > 0 ? resumen.resueltas / resumen.total : 0;
  const escalamiento = resumen.total > 0 ? resumen.escaladas / resumen.total : 0;

  return (
    <>
      <Encabezado
        titulo="Resumen"
        descripcion={`${config.nombre} · últimos ${dias} días`}
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
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-linea bg-linea lg:grid-cols-5">
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
          <Indicador
            etiqueta="Reservas generadas"
            valor={String(resumen.reservasGeneradas)}
            detalle={resumen.total > 0 ? `${porcentaje(resumen.reservasGeneradas / resumen.total)} de las llamadas` : undefined}
          />
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
