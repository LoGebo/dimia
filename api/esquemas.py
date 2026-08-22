from __future__ import annotations

import uuid
from datetime import date, datetime, time
from decimal import Decimal
from enum import StrEnum
from typing import Annotated, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

T = TypeVar("T")

Texto = Annotated[str, StringConstraints(min_length=1, max_length=200, strip_whitespace=True)]
TextoLargo = Annotated[str, StringConstraints(min_length=1, max_length=4000, strip_whitespace=True)]
Telefono = Annotated[str, Field(pattern=r"^\+?[0-9]{8,20}$")]
ClaveVertical = Annotated[str, Field(min_length=1, max_length=40, pattern=r"^[a-z_]+$")]


class TipoRegla(StrEnum):
    DISPONIBLE = "disponible"
    BLOQUEO = "bloqueo"
    FESTIVO = "festivo"


class EstadoReserva(StrEnum):
    CONFIRMADA = "confirmada"
    CANCELADA = "cancelada"
    NO_ASISTIO = "no_asistio"
    COMPLETADA = "completada"


class Modelo(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Pagina(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limite: int
    desplazamiento: int


class TenantCrear(Modelo):
    nombre: Texto
    vertical: ClaveVertical = "recepcion"
    zona_horaria: Texto = "America/Mexico_City"
    telefono_entrada: Telefono | None = None
    telefono_escalamiento: Telefono | None = None
    voz_id: str | None = None
    slot_granularidad_min: int = Field(default=15, ge=5, le=120)
    anticipacion_min: int = Field(default=60, ge=0)
    horizonte_dias: int = Field(default=60, ge=1, le=365)


class TenantActualizar(Modelo):
    nombre: Texto | None = None
    vertical: ClaveVertical | None = None
    zona_horaria: Texto | None = None
    telefono_entrada: Telefono | None = None
    telefono_escalamiento: Telefono | None = None
    voz_id: str | None = None
    slot_granularidad_min: int | None = Field(default=None, ge=5, le=120)
    anticipacion_min: int | None = Field(default=None, ge=0)
    horizonte_dias: int | None = Field(default=None, ge=1, le=365)
    activo: bool | None = None


class Tenant(Modelo):
    id: uuid.UUID
    nombre: str
    vertical: str
    zona_horaria: str
    telefono_entrada: str | None
    telefono_escalamiento: str | None
    voz_id: str | None
    slot_granularidad_min: int
    anticipacion_min: int
    horizonte_dias: int
    activo: bool
    creado: datetime
    rol: str | None = None


class RecursoCrear(Modelo):
    nombre: Texto
    capacidad: int = Field(default=1, ge=1, le=1000)
    metadatos: dict = Field(default_factory=dict)


class RecursoActualizar(Modelo):
    nombre: Texto | None = None
    capacidad: int | None = Field(default=None, ge=1, le=1000)
    metadatos: dict | None = None
    activo: bool | None = None


class Recurso(Modelo):
    id: uuid.UUID
    tenant_id: uuid.UUID
    nombre: str
    capacidad: int
    metadatos: dict
    activo: bool


class ServicioCrear(Modelo):
    nombre: Texto
    alias: list[Texto] = Field(default_factory=list, max_length=30)
    duracion_min: int = Field(ge=1, le=1440)
    buffer_min: int = Field(default=0, ge=0, le=1440)
    precio: Decimal | None = Field(default=None, ge=0, le=Decimal("99999999.99"))
    recursos_validos: list[uuid.UUID] = Field(default_factory=list, max_length=200)


class ServicioActualizar(Modelo):
    nombre: Texto | None = None
    alias: list[Texto] | None = Field(default=None, max_length=30)
    duracion_min: int | None = Field(default=None, ge=1, le=1440)
    buffer_min: int | None = Field(default=None, ge=0, le=1440)
    precio: Decimal | None = Field(default=None, ge=0, le=Decimal("99999999.99"))
    recursos_validos: list[uuid.UUID] | None = Field(default=None, max_length=200)
    activo: bool | None = None


class Servicio(Modelo):
    id: uuid.UUID
    tenant_id: uuid.UUID
    nombre: str
    alias: list[str]
    duracion_min: int
    buffer_min: int
    precio: Decimal | None
    recursos_validos: list[uuid.UUID]
    activo: bool


class HorarioCrear(Modelo):
    resource_id: uuid.UUID | None = None
    tipo: TipoRegla = TipoRegla.DISPONIBLE
    dia_semana: int | None = Field(default=None, ge=0, le=6)
    fecha: date | None = None
    hora_inicio: time
    hora_fin: time

    @model_validator(mode="after")
    def validar(self) -> HorarioCrear:
        if (self.dia_semana is None) == (self.fecha is None):
            raise ValueError("indica dia_semana (recurrente) o fecha (puntual), no ambos")
        if self.hora_fin <= self.hora_inicio:
            raise ValueError("hora_fin debe ser mayor que hora_inicio")
        return self


class Horario(Modelo):
    id: uuid.UUID
    tenant_id: uuid.UUID
    resource_id: uuid.UUID | None
    tipo: TipoRegla
    dia_semana: int | None
    fecha: date | None
    hora_inicio: time
    hora_fin: time


class ConocimientoCrear(Modelo):
    pregunta: TextoLargo
    respuesta: TextoLargo
    prioridad: int = Field(default=0, ge=0, le=1000)


class ConocimientoActualizar(Modelo):
    pregunta: TextoLargo | None = None
    respuesta: TextoLargo | None = None
    prioridad: int | None = Field(default=None, ge=0, le=1000)


class VerticalPlantilla(Modelo):
    clave: str
    nombre: str
    saludo: str
    herramientas: list[str]


class Recado(Modelo):
    id: uuid.UUID
    tenant_id: uuid.UUID
    nombre: str | None
    telefono: str
    asunto: str
    detalle: str | None
    campos: dict
    atendido: bool
    call_id: str | None
    creado: datetime


class RecadoActualizar(Modelo):
    atendido: bool | None = None
    detalle: str | None = Field(default=None, max_length=4000)


class Conocimiento(Modelo):
    id: uuid.UUID
    tenant_id: uuid.UUID
    pregunta: str
    respuesta: str
    prioridad: int


class Reserva(Modelo):
    id: uuid.UUID
    tenant_id: uuid.UUID
    codigo: str
    cliente_nombre: str
    telefono: str
    personas: int
    notas: str | None
    inicio: datetime
    fin: datetime
    estado: EstadoReserva
    call_id: str | None
    creado: datetime
    recurso_nombre: str
    servicio_nombre: str


class ReservaActualizar(Modelo):
    estado: EstadoReserva | None = None
    notas: str | None = Field(default=None, max_length=4000)


class MetricasResumen(Modelo):
    desde: date
    hasta: date
    llamadas: int
    llamadas_resueltas: int
    escalamientos: int
    containment_rate: float
    tasa_escalamiento: float
    minutos_totales: float
    duracion_media_seg: float
    reservas_confirmadas: int
    reservas_canceladas: int
    recados_pendientes: int


class MetricasDia(Modelo):
    dia: date
    llamadas: int
    resueltas: int
    escalamientos: int
    minutos: float


class Metricas(Modelo):
    resumen: MetricasResumen
    por_dia: list[MetricasDia]
    motivos_escalamiento: dict[str, int]
