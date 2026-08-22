from __future__ import annotations

import random
import re
import unicodedata
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import yaml

DIAS_SEMANA = {
    "lunes": 0,
    "martes": 1,
    "miercoles": 2,
    "jueves": 3,
    "viernes": 4,
    "sabado": 5,
    "domingo": 6,
}

RUTA_ESCENARIOS = Path(__file__).parent / "escenarios"


def normalizar(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFD", texto)
    return "".join(c for c in sin_acentos if unicodedata.category(c) != "Mn").lower()


def resolver_dia(expresion: str | int, tz: ZoneInfo, hoy: date | None = None) -> date:
    hoy = hoy or datetime.now(tz).date()
    if isinstance(expresion, int):
        return hoy + timedelta(days=expresion)

    texto = normalizar(str(expresion).strip())
    if texto == "hoy":
        return hoy
    if texto == "manana":
        return hoy + timedelta(days=1)
    if re.fullmatch(r"[+-]?\d+", texto):
        return hoy + timedelta(days=int(texto))
    if texto.startswith("proximo_"):
        objetivo = DIAS_SEMANA.get(texto.removeprefix("proximo_"))
        if objetivo is None:
            raise ValueError(f"dia desconocido: {expresion}")
        dia = hoy + timedelta(days=1)
        while dia.weekday() != objetivo:
            dia += timedelta(days=1)
        return dia
    return date.fromisoformat(str(expresion))


@dataclass(frozen=True, slots=True)
class Ruido:
    sustituciones: Mapping[str, str] = field(default_factory=dict)
    probabilidad: float = 0.0

    def aplicar(self, texto: str, rng: random.Random) -> str:
        if not self.sustituciones or self.probabilidad <= 0:
            return texto
        salida = texto
        for original, sustituto in self.sustituciones.items():
            if original in salida and rng.random() < self.probabilidad:
                salida = salida.replace(original, sustituto, 1)
        return salida


@dataclass(frozen=True, slots=True)
class ReservaPrevia:
    servicio: str
    dia: str
    hora: str
    nombre: str
    telefono: str | None = None
    personas: int = 1


@dataclass(frozen=True, slots=True)
class EstadoInicial:
    dia: str = "proximo_miercoles"
    llenar_dia: bool = False
    reservas: tuple[ReservaPrevia, ...] = ()


@dataclass(frozen=True, slots=True)
class Escenario:
    id: str
    descripcion: str
    tenant: str
    persona: str
    guion: tuple[str, ...]
    telefono_cliente: str = "+5215500001111"
    estado_inicial: EstadoInicial = field(default_factory=EstadoInicial)
    ruido: Ruido = field(default_factory=Ruido)
    max_turnos: int = 14
    semilla: int = 7
    etiquetas: tuple[str, ...] = ()
    rubrica: tuple[Mapping[str, Any], ...] = ()

    @property
    def contencion_esperada(self) -> bool:
        return not self.escalamiento_esperado

    @property
    def escalamiento_esperado(self) -> bool:
        return any(
            regla.get("tipo") == "escalo" and regla.get("esperado", True)
            for regla in self.rubrica
        )


def _reserva_previa(crudo: Mapping[str, Any]) -> ReservaPrevia:
    return ReservaPrevia(
        servicio=crudo["servicio"],
        dia=str(crudo.get("dia", "proximo_miercoles")),
        hora=str(crudo["hora"]),
        nombre=crudo["nombre"],
        telefono=crudo.get("telefono"),
        personas=int(crudo.get("personas", 1)),
    )


def _estado_inicial(crudo: Mapping[str, Any] | None) -> EstadoInicial:
    crudo = crudo or {}
    return EstadoInicial(
        dia=str(crudo.get("dia", "proximo_miercoles")),
        llenar_dia=bool(crudo.get("llenar_dia", False)),
        reservas=tuple(_reserva_previa(r) for r in crudo.get("reservas", ())),
    )


def desde_dict(crudo: Mapping[str, Any]) -> Escenario:
    ruido_crudo = crudo.get("ruido") or {}
    return Escenario(
        id=crudo["id"],
        descripcion=crudo.get("descripcion", ""),
        tenant=crudo["tenant"],
        persona=crudo["persona"],
        guion=tuple(str(f) for f in crudo.get("guion", ())),
        telefono_cliente=str(crudo.get("telefono_cliente", "+5215500001111")),
        estado_inicial=_estado_inicial(crudo.get("estado_inicial")),
        ruido=Ruido(
            sustituciones=dict(ruido_crudo.get("sustituciones", {})),
            probabilidad=float(ruido_crudo.get("probabilidad", 0.0)),
        ),
        max_turnos=int(crudo.get("max_turnos", 14)),
        semilla=int(crudo.get("semilla", 7)),
        etiquetas=tuple(crudo.get("etiquetas", ())),
        rubrica=tuple(crudo.get("rubrica", ())),
    )


def cargar(ruta: Path | str = RUTA_ESCENARIOS, filtro: Sequence[str] = ()) -> list[Escenario]:
    ruta = Path(ruta)
    archivos: Iterator[Path] = iter([ruta]) if ruta.is_file() else iter(sorted(ruta.glob("*.yaml")))
    escenarios: list[Escenario] = []
    for archivo in archivos:
        for crudo in yaml.safe_load_all(archivo.read_text(encoding="utf-8")):
            if crudo:
                escenarios.append(desde_dict(crudo))

    vistos: set[str] = set()
    for escenario in escenarios:
        if escenario.id in vistos:
            raise ValueError(f"escenario duplicado: {escenario.id}")
        vistos.add(escenario.id)

    if filtro:
        escenarios = [e for e in escenarios if e.id in filtro or set(e.etiquetas) & set(filtro)]
    return escenarios


def rellenar(texto: str, dia: date, tz: ZoneInfo) -> str:
    nombres = ("lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo")
    return texto.replace("{fecha}", dia.isoformat()).replace(
        "{dia}", f"{nombres[dia.weekday()]} {dia.day}"
    )
