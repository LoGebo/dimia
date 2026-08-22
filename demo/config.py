from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal

from app.config import settings

ModoCerebro = Literal["falso", "claude"]
ModoVoz = Literal["navegador", "livekit"]


@dataclass(frozen=True, slots=True)
class ModoDemo:
    cerebro: ModoCerebro
    voz: ModoVoz
    faltantes: tuple[str, ...]

    @property
    def es_real(self) -> bool:
        return self.cerebro == "claude" and self.voz == "livekit"

    @property
    def etiqueta(self) -> str:
        if self.es_real:
            return "Modo real"
        if self.cerebro == "claude":
            return "Modo hibrido"
        return "Modo sin llaves"

    @property
    def explicacion(self) -> str:
        cerebro = {
            "falso": "cerebro determinista local",
            "claude": f"cerebro {settings().llm_model}",
        }[self.cerebro]
        voz = {
            "navegador": "voz del navegador (Web Speech)",
            "livekit": "voz LiveKit WebRTC (Deepgram + Cartesia)",
        }[self.voz]
        return f"{cerebro} · {voz} · Postgres real"

    def a_json(self) -> dict[str, object]:
        return {
            "cerebro": self.cerebro,
            "voz": self.voz,
            "etiqueta": self.etiqueta,
            "explicacion": self.explicacion,
            "es_real": self.es_real,
            "faltantes": list(self.faltantes),
        }


def _tiene(nombre: str) -> bool:
    return bool(os.getenv(nombre, "").strip())


@lru_cache
def modo() -> ModoDemo:
    forzado = os.getenv("DEMO_FORZAR_MODO", "").strip().lower()
    llaves_cerebro = ("ANTHROPIC_API_KEY",)
    llaves_voz = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
                  "DEEPGRAM_API_KEY", "CARTESIA_API_KEY")

    faltantes = tuple(n for n in llaves_cerebro + llaves_voz if not _tiene(n))
    cerebro: ModoCerebro = "claude" if _tiene("ANTHROPIC_API_KEY") else "falso"
    voz: ModoVoz = "livekit" if all(_tiene(n) for n in llaves_voz) else "navegador"

    if forzado == "falso":
        cerebro, voz = "falso", "navegador"
    elif forzado == "real":
        cerebro, voz = "claude", "livekit"

    return ModoDemo(cerebro=cerebro, voz=voz, faltantes=faltantes)


@dataclass(frozen=True, slots=True)
class ConfiguracionDemo:
    dsn: str
    puerto: int
    telefono_prospecto: str

    @property
    def modo(self) -> ModoDemo:
        return modo()


@lru_cache
def configuracion() -> ConfiguracionDemo:
    return ConfiguracionDemo(
        dsn=os.getenv("DEMO_PG_DSN") or os.getenv("PG_DSN") or settings().pg_dsn,
        puerto=int(os.getenv("DEMO_PUERTO", "8800")),
        telefono_prospecto=os.getenv("DEMO_TELEFONO", "+525500000000"),
    )
