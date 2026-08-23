from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from datetime import date, time
from decimal import Decimal
from pathlib import Path
from typing import Any

import asyncpg
import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from api.config import api_settings
from api.esquemas import ClaveVertical, ConocimientoCrear, RecursoCrear, ServicioCrear, TipoRegla

DIRECTORIO_PLANTILLAS = Path(__file__).parent / "templates"
DIAS = ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")


def _json(valor: Any) -> str:
    return json.dumps(valor, ensure_ascii=False)


class ReglaPlantilla(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: TipoRegla = TipoRegla.DISPONIBLE
    recurso: str | None = None
    dias: list[int] = Field(default_factory=list)
    fecha: date | None = None
    hora_inicio: time
    hora_fin: time

    @model_validator(mode="after")
    def validar(self) -> ReglaPlantilla:
        if bool(self.dias) == (self.fecha is not None):
            raise ValueError("cada regla lleva dias (recurrente) o fecha (puntual), no ambos")
        if any(d < 0 or d > 6 for d in self.dias):
            raise ValueError("dias usa 0=lunes hasta 6=domingo")
        if self.hora_fin <= self.hora_inicio:
            raise ValueError("hora_fin debe ser mayor que hora_inicio")
        return self


class DatosNegocio(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nombre: str = Field(min_length=1, max_length=200)
    zona_horaria: str = "America/Mexico_City"
    telefono_entrada: str | None = None
    telefono_escalamiento: str | None = None
    voz_id: str | None = None
    slot_granularidad_min: int = Field(default=15, ge=5, le=120)
    anticipacion_min: int = Field(default=60, ge=0)
    horizonte_dias: int = Field(default=60, ge=1, le=365)


class PlanAlta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vertical: ClaveVertical = "recepcion"
    tenant: DatosNegocio
    recursos: list[RecursoCrear] = Field(default_factory=list)
    servicios: list[ServicioCrear] = Field(default_factory=list)
    horarios: list[ReglaPlantilla] = Field(default_factory=list)
    conocimiento: list[ConocimientoCrear] = Field(default_factory=list)
    owner: uuid.UUID | None = None


class ResumenAlta(BaseModel):
    tenant_id: uuid.UUID
    nombre: str
    vertical: str
    recursos: int
    servicios: int
    horarios: int
    conocimiento: int


def plantillas_disponibles() -> list[str]:
    return sorted(p.stem for p in DIRECTORIO_PLANTILLAS.glob("*.yaml"))


def cargar_yaml(ruta: Path) -> dict[str, Any]:
    with ruta.open(encoding="utf-8") as archivo:
        contenido = yaml.safe_load(archivo)
    if not isinstance(contenido, dict):
        raise ValueError(f"{ruta} no contiene un mapeo YAML valido")
    return contenido


def cargar_plantilla(nombre: str) -> dict[str, Any]:
    ruta = DIRECTORIO_PLANTILLAS / f"{nombre}.yaml"
    if not ruta.exists():
        raise ValueError(
            f"plantilla '{nombre}' inexistente; disponibles: {', '.join(plantillas_disponibles())}"
        )
    return cargar_yaml(ruta)


def _preguntar(etiqueta: str, defecto: str | None = None, obligatorio: bool = False) -> str | None:
    sufijo = f" [{defecto}]" if defecto else ""
    while True:
        respuesta = input(f"{etiqueta}{sufijo}: ").strip()
        if respuesta:
            return respuesta
        if defecto is not None:
            return defecto
        if not obligatorio:
            return None
        print("  este dato es obligatorio")


def _preguntar_entero(etiqueta: str, defecto: int) -> int:
    while True:
        crudo = _preguntar(etiqueta, str(defecto))
        try:
            return int(crudo)
        except (TypeError, ValueError):
            print("  escribe un numero entero")


def plan_interactivo() -> PlanAlta:
    print("\nAlta de cliente nuevo\n")
    opciones = plantillas_disponibles()
    vertical = _preguntar(f"Vertical ({', '.join(opciones)})", opciones[0]) or opciones[0]
    while vertical not in opciones:
        vertical = _preguntar(f"Vertical ({', '.join(opciones)})", opciones[0]) or opciones[0]

    crudo = cargar_plantilla(vertical)
    negocio = crudo["tenant"]

    negocio["nombre"] = _preguntar("Nombre del negocio", obligatorio=True)
    negocio["zona_horaria"] = _preguntar("Zona horaria", negocio.get("zona_horaria"))
    negocio["telefono_entrada"] = _preguntar("Numero de entrada (E.164, opcional)")
    negocio["telefono_escalamiento"] = _preguntar("Numero de escalamiento (opcional)")
    negocio["slot_granularidad_min"] = _preguntar_entero(
        "Granularidad de slots en minutos", negocio.get("slot_granularidad_min", 15)
    )

    print(f"\nLa plantilla trae {len(crudo['recursos'])} recursos:")
    for recurso in crudo["recursos"]:
        print(f"  - {recurso['nombre']} (capacidad {recurso.get('capacidad', 1)})")
    if (_preguntar("Reemplazar la lista de recursos? (s/n)", "n") or "n").lower().startswith("s"):
        crudo["recursos"] = _capturar_recursos()

    print(f"\nLa plantilla trae {len(crudo['servicios'])} servicios:")
    for servicio in crudo["servicios"]:
        print(f"  - {servicio['nombre']} ({servicio['duracion_min']} min)")
    if (_preguntar("Reemplazar la lista de servicios? (s/n)", "n") or "n").lower().startswith("s"):
        crudo["servicios"] = _capturar_servicios()

    owner = _preguntar("UUID del usuario owner en Supabase (opcional)")

    crudo["vertical"] = vertical
    crudo["owner"] = owner
    return PlanAlta.model_validate(crudo)


def _capturar_recursos() -> list[dict[str, Any]]:
    recursos: list[dict[str, Any]] = []
    print("  Escribe los recursos. Enter vacio para terminar.")
    while True:
        nombre = _preguntar("  Nombre del recurso")
        if not nombre:
            break
        recursos.append({"nombre": nombre, "capacidad": _preguntar_entero("  Capacidad", 1)})
    return recursos


def _capturar_servicios() -> list[dict[str, Any]]:
    servicios: list[dict[str, Any]] = []
    print("  Escribe los servicios. Enter vacio para terminar.")
    while True:
        nombre = _preguntar("  Nombre del servicio")
        if not nombre:
            break
        alias = _preguntar("  Alias separados por coma (opcional)") or ""
        precio = _preguntar("  Precio (opcional)")
        servicios.append(
            {
                "nombre": nombre,
                "alias": [a.strip() for a in alias.split(",") if a.strip()],
                "duracion_min": _preguntar_entero("  Duracion en minutos", 30),
                "buffer_min": _preguntar_entero("  Buffer en minutos", 0),
                "precio": Decimal(precio) if precio else None,
            }
        )
    return servicios


async def aplicar(plan: PlanAlta, dsn: str) -> ResumenAlta:
    conexion = await asyncpg.connect(dsn, statement_cache_size=0)
    try:
        async with conexion.transaction():
            tenant_id = await conexion.fetchval(
                """insert into tenant (nombre, vertical, zona_horaria, telefono_entrada,
                                       telefono_escalamiento, voz_id, slot_granularidad_min,
                                       anticipacion_min, horizonte_dias)
                   values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id""",
                plan.tenant.nombre,
                plan.vertical,
                plan.tenant.zona_horaria,
                plan.tenant.telefono_entrada,
                plan.tenant.telefono_escalamiento,
                plan.tenant.voz_id,
                plan.tenant.slot_granularidad_min,
                plan.tenant.anticipacion_min,
                plan.tenant.horizonte_dias,
            )

            if plan.owner is not None:
                await conexion.execute(
                    "insert into auth.users (id) values ($1) on conflict do nothing", plan.owner
                )
                await conexion.execute(
                    "insert into tenant_member (tenant_id, user_id, rol) values ($1,$2,'owner')",
                    tenant_id,
                    plan.owner,
                )

            por_nombre: dict[str, uuid.UUID] = {}
            for recurso in plan.recursos:
                por_nombre[recurso.nombre] = await conexion.fetchval(
                    """insert into resource (tenant_id, nombre, capacidad, metadatos)
                       values ($1,$2,$3,$4::jsonb) returning id""",
                    tenant_id,
                    recurso.nombre,
                    recurso.capacidad,
                    _json(recurso.metadatos),
                )

            for servicio in plan.servicios:
                await conexion.execute(
                    """insert into service (tenant_id, nombre, alias, duracion_min,
                                            buffer_min, precio, recursos_validos)
                       values ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb)""",
                    tenant_id,
                    servicio.nombre,
                    _json(servicio.alias),
                    servicio.duracion_min,
                    servicio.buffer_min,
                    servicio.precio,
                    _json([str(r) for r in servicio.recursos_validos]),
                )

            reglas = 0
            for regla in plan.horarios:
                recurso_id = por_nombre.get(regla.recurso) if regla.recurso else None
                if regla.recurso and recurso_id is None:
                    raise ValueError(f"la regla apunta al recurso inexistente '{regla.recurso}'")
                for dia in regla.dias or [None]:
                    await conexion.execute(
                        """insert into schedule_rule (tenant_id, resource_id, tipo,
                                                      dia_semana, fecha, hora_inicio, hora_fin)
                           values ($1,$2,$3::rule_kind,$4,$5,$6,$7)""",
                        tenant_id,
                        recurso_id,
                        regla.tipo.value,
                        dia,
                        regla.fecha,
                        regla.hora_inicio,
                        regla.hora_fin,
                    )
                    reglas += 1

            for entrada in plan.conocimiento:
                await conexion.execute(
                    """insert into knowledge (tenant_id, pregunta, respuesta, prioridad)
                       values ($1,$2,$3,$4)""",
                    tenant_id,
                    entrada.pregunta,
                    entrada.respuesta,
                    entrada.prioridad,
                )

        return ResumenAlta(
            tenant_id=tenant_id,
            nombre=plan.tenant.nombre,
            vertical=plan.vertical,
            recursos=len(plan.recursos),
            servicios=len(plan.servicios),
            horarios=reglas,
            conocimiento=len(plan.conocimiento),
        )
    finally:
        await conexion.close()


def construir_plan(args: argparse.Namespace) -> PlanAlta:
    if args.archivo:
        crudo = cargar_yaml(Path(args.archivo))
    elif args.plantilla:
        crudo = cargar_plantilla(args.plantilla)
        crudo["vertical"] = args.plantilla
    else:
        return plan_interactivo()

    negocio = crudo.setdefault("tenant", {})
    if args.nombre:
        negocio["nombre"] = args.nombre
    if args.telefono:
        negocio["telefono_entrada"] = args.telefono
    if args.escalamiento:
        negocio["telefono_escalamiento"] = args.escalamiento
    if args.zona:
        negocio["zona_horaria"] = args.zona
    if args.owner:
        crudo["owner"] = args.owner
    return PlanAlta.model_validate(crudo)


def describir(plan: PlanAlta) -> str:
    lineas = [
        f"negocio      {plan.tenant.nombre}",
        f"vertical     {plan.vertical}",
        f"zona         {plan.tenant.zona_horaria}",
        f"entrada      {plan.tenant.telefono_entrada or '(sin numero)'}",
        f"recursos     {', '.join(r.nombre for r in plan.recursos) or '(ninguno)'}",
        f"servicios    {', '.join(s.nombre for s in plan.servicios) or '(ninguno)'}",
    ]
    for regla in plan.horarios:
        cuando = ", ".join(DIAS[d] for d in regla.dias) if regla.dias else str(regla.fecha)
        lineas.append(
            f"horario      {regla.tipo.value:10} {cuando}: "
            f"{regla.hora_inicio}-{regla.hora_fin}"
        )
    lineas.append(f"conocimiento {len(plan.conocimiento)} entradas")
    return "\n".join(lineas)


def analizar_argumentos(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="python -m api.onboarding",
        description="Alta de un cliente nuevo: tenant, recursos, servicios, horarios y FAQ.",
    )
    parser.add_argument("--plantilla", choices=plantillas_disponibles(), help="vertical base")
    parser.add_argument("--archivo", help="YAML con el plan completo")
    parser.add_argument("--nombre", help="nombre del negocio")
    parser.add_argument("--telefono", help="numero de entrada en E.164")
    parser.add_argument("--escalamiento", help="numero al que se transfiere")
    parser.add_argument("--zona", help="zona horaria IANA")
    parser.add_argument("--owner", help="uuid del usuario de Supabase que sera owner")
    parser.add_argument("--dsn", default=api_settings().pg_dsn, help="DSN de Postgres")
    parser.add_argument("--dry-run", action="store_true", help="muestra el plan sin escribir")
    parser.add_argument("--listar-plantillas", action="store_true")
    parser.add_argument("--exportar", metavar="VERTICAL", help="imprime la plantilla en YAML")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = analizar_argumentos(argv)

    if args.listar_plantillas:
        print("\n".join(plantillas_disponibles()))
        return 0

    if args.exportar:
        print(yaml.safe_dump(cargar_plantilla(args.exportar), allow_unicode=True, sort_keys=False))
        return 0

    try:
        plan = construir_plan(args)
    except (ValidationError, ValueError) as exc:
        print(f"plan invalido:\n{exc}", file=sys.stderr)
        return 2

    print(describir(plan))

    if args.dry_run:
        print("\ndry-run: no se escribio nada")
        return 0

    try:
        resumen = asyncio.run(aplicar(plan, args.dsn))
    except (asyncpg.PostgresError, ValueError) as exc:
        print(f"\nno se pudo dar de alta: {exc}", file=sys.stderr)
        return 1

    print(
        f"\nlisto. tenant_id={resumen.tenant_id}"
        f"\n{resumen.recursos} recursos, {resumen.servicios} servicios, "
        f"{resumen.horarios} reglas de horario, {resumen.conocimiento} entradas de FAQ"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
