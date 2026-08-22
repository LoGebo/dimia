from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Query

from api.auth import MiembroDelTenant
from api.errores import CodigoError, ErrorApi
from api.esquemas import Metricas, MetricasDia, MetricasResumen
from api.repositorio import ejecutar, ejecutar_muchos

router = APIRouter(prefix="/v1/tenants/{tenant_id}/metricas", tags=["metricas"])

VENTANA_DEFAULT_DIAS = 30
VENTANA_MAX_DIAS = 366

RESUMEN = """
select
  count(*)::int                                             as llamadas,
  count(*) filter (where resuelto)::int                      as llamadas_resueltas,
  count(*) filter (where escalado)::int                      as escalamientos,
  coalesce(sum(duracion_seg), 0)::float                      as segundos,
  coalesce(avg(duracion_seg), 0)::float                      as duracion_media_seg
from call_log
where tenant_id = $1
  and inicio >= ($2::date::timestamp at time zone $4)
  and inicio <  (($3::date + 1)::timestamp at time zone $4)
"""

POR_DIA = """
select
  (inicio at time zone $4)::date                              as dia,
  count(*)::int                                               as llamadas,
  count(*) filter (where resuelto)::int                        as resueltas,
  count(*) filter (where escalado)::int                        as escalamientos,
  (coalesce(sum(duracion_seg), 0) / 60.0)::float               as minutos
from call_log
where tenant_id = $1
  and inicio >= ($2::date::timestamp at time zone $4)
  and inicio <  (($3::date + 1)::timestamp at time zone $4)
group by 1
order by 1
"""

MOTIVOS = """
select coalesce(motivo_escalamiento, 'sin_motivo') as motivo, count(*)::int as veces
from call_log
where tenant_id = $1 and escalado
  and inicio >= ($2::date::timestamp at time zone $4)
  and inicio <  (($3::date + 1)::timestamp at time zone $4)
group by 1
order by veces desc
"""

RECADOS = """
select count(*)::int as pendientes
from lead
where tenant_id = $1 and not atendido
  and creado >= ($2::date::timestamp at time zone $4)
  and creado <  (($3::date + 1)::timestamp at time zone $4)
"""

RESERVAS = """
select
  count(*) filter (where estado = 'confirmada')::int as confirmadas,
  count(*) filter (where estado = 'cancelada')::int  as canceladas
from booking
where tenant_id = $1
  and creado >= ($2::date::timestamp at time zone $4)
  and creado <  (($3::date + 1)::timestamp at time zone $4)
"""


def proporcion(parte: int, total: int) -> float:
    return round(parte / total, 4) if total else 0.0


@router.get("", response_model=Metricas)
async def metricas_del_tenant(
    tenant_id: uuid.UUID,
    membresia: MiembroDelTenant,
    desde: Annotated[date | None, Query()] = None,
    hasta: Annotated[date | None, Query()] = None,
) -> Metricas:
    """Containment rate, escalamientos, llamadas por dia y minutos hablados."""
    fila_tenant = await ejecutar("select zona_horaria from tenant where id = $1", tenant_id)
    if fila_tenant is None:
        raise ErrorApi(CodigoError.NO_ENCONTRADO, "negocio no encontrado")
    tz = fila_tenant["zona_horaria"]

    hasta = hasta or date.today()
    desde = desde or hasta - timedelta(days=VENTANA_DEFAULT_DIAS - 1)
    if desde > hasta:
        raise ErrorApi(CodigoError.VALIDACION, "desde debe ser anterior a hasta", campo="desde")
    if (hasta - desde).days > VENTANA_MAX_DIAS:
        raise ErrorApi(
            CodigoError.VALIDACION, f"la ventana maxima es de {VENTANA_MAX_DIAS} dias", campo="desde"
        )

    argumentos = (tenant_id, desde, hasta, tz)
    resumen = await ejecutar(RESUMEN, *argumentos)
    reservas = await ejecutar(RESERVAS, *argumentos)
    recados = await ejecutar(RECADOS, *argumentos)
    dias = await ejecutar_muchos(POR_DIA, *argumentos)
    motivos = await ejecutar_muchos(MOTIVOS, *argumentos)

    llamadas = resumen["llamadas"]

    return Metricas(
        resumen=MetricasResumen(
            desde=desde,
            hasta=hasta,
            llamadas=llamadas,
            llamadas_resueltas=resumen["llamadas_resueltas"],
            escalamientos=resumen["escalamientos"],
            containment_rate=proporcion(resumen["llamadas_resueltas"], llamadas),
            tasa_escalamiento=proporcion(resumen["escalamientos"], llamadas),
            minutos_totales=round(resumen["segundos"] / 60.0, 2),
            duracion_media_seg=round(resumen["duracion_media_seg"], 2),
            reservas_confirmadas=reservas["confirmadas"],
            reservas_canceladas=reservas["canceladas"],
            recados_pendientes=recados["pendientes"],
        ),
        por_dia=[MetricasDia(**dict(f)) for f in dias],
        motivos_escalamiento={f["motivo"]: f["veces"] for f in motivos},
    )
