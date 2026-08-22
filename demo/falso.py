"""Cerebro determinista para el modo sin llaves.

Implementa el mismo protocolo ClienteLLM que Claude y lee exactamente el
mismo prompt: los ids de servicio, los precios y las FAQ salen del texto que
arma app.prompt.construir, nunca de datos propios. Si no esta en el prompt o
no lo devolvio una herramienta, este cerebro tampoco lo inventa.
"""
from __future__ import annotations

import re
import unicodedata
import uuid
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from evals.llm import (
    Elemento,
    LlamadaHerramienta,
    RespuestaLLM,
    TurnoResultados,
    TurnoUsuario,
)

PATRON_SERVICIO = re.compile(
    r"^\s*-\s(?P<nombre>.+?)\s\(id=(?P<id>[0-9a-fA-F-]{36}),\s(?P<duracion>\d+)\smin"
    r"(?:,\s\$(?P<precio>[\d.]+))?\)(?:\s—\stambien le dicen:\s(?P<alias>.*))?\s*$"
)
PATRON_FAQ = re.compile(r"^\s*-\s(?P<pregunta>.+?)\s->\s(?P<respuesta>.+?)\s*$")
PATRON_OPCION = re.compile(
    r"(?P<hablado>[^|]+?)\s\(inicio_iso=(?P<inicio>[^,]+),\srecurso_id=(?P<recurso>[0-9a-fA-F-]{36})\)"
)
PATRON_CODIGO = re.compile(r"deletreado:\s([A-Z0-9 ]+)\.")

NUMEROS = {
    "un": 1, "una": 1, "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
    "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "once": 11, "doce": 12,
}
DIAS_SEMANA = {
    "lunes": 0, "martes": 1, "miercoles": 2, "jueves": 3,
    "viernes": 4, "sabado": 5, "domingo": 6,
}
ESCALAMIENTO = {
    "alergia": "alergia declarada por el cliente",
    "alergico": "alergia declarada por el cliente",
    "alergica": "alergia declarada por el cliente",
    "cacahuate": "alergia declarada por el cliente",
    "mariscos": "alergia declarada por el cliente",
    "gluten": "restriccion alimentaria delicada",
    "urgencia": "posible urgencia medica",
    "emergencia": "posible urgencia medica",
    "sangrado": "posible urgencia medica",
    "queja": "queja del cliente",
    "reclamo": "queja del cliente",
    "gerente": "lo pidio explicitamente",
    "humano": "lo pidio explicitamente",
    "persona real": "lo pidio explicitamente",
}
AFIRMACIONES = {"si", "sip", "simon", "claro", "va", "sale", "correcto", "esa",
                "ese", "perfecto", "ok", "okey", "dale", "confirmo", "asi es"}
VACIAS = {"de", "la", "el", "los", "las", "un", "una", "que", "en", "y", "a",
          "por", "para", "con", "es", "esta", "estan", "tienen", "tiene", "hay",
          "cual", "cuales", "como", "su", "se", "me", "mi", "lo"}


def normalizar(texto: str) -> str:
    sin_acentos = unicodedata.normalize("NFD", texto)
    limpio = "".join(c for c in sin_acentos if unicodedata.category(c) != "Mn")
    return re.sub(r"[^\w\s]", " ", limpio.lower())


def _palabras(texto: str) -> set[str]:
    return {p for p in normalizar(texto).split() if p not in VACIAS and len(p) > 2}


def _en_palabras(numero: int) -> str:
    for palabra, valor in NUMEROS.items():
        if valor == numero and len(palabra) > 2:
            return palabra
    return str(numero)


@dataclass(frozen=True, slots=True)
class Servicio:
    id: str
    nombre: str
    duracion_min: int
    precio: float | None
    alias: tuple[str, ...]

    @property
    def terminos(self) -> tuple[str, ...]:
        return (normalizar(self.nombre), *(normalizar(a) for a in self.alias))


@dataclass(frozen=True, slots=True)
class Opcion:
    hablado: str
    inicio_iso: str
    recurso_id: str

    @property
    def claves(self) -> set[str]:
        claves = set(normalizar(self.hablado).split())
        for token in list(claves):
            if token.isdigit():
                claves.add(_en_palabras(int(token)))
        return claves


def leer_servicios(sistema: str) -> list[Servicio]:
    servicios: list[Servicio] = []
    for linea in sistema.splitlines():
        coincidencia = PATRON_SERVICIO.match(linea)
        if coincidencia is None:
            continue
        alias = coincidencia.group("alias") or ""
        servicios.append(
            Servicio(
                id=coincidencia.group("id"),
                nombre=coincidencia.group("nombre"),
                duracion_min=int(coincidencia.group("duracion")),
                precio=float(coincidencia.group("precio")) if coincidencia.group("precio") else None,
                alias=tuple(a.strip() for a in alias.split(",") if a.strip()),
            )
        )
    return servicios


def leer_faq(sistema: str) -> list[tuple[str, str]]:
    dentro = False
    faq: list[tuple[str, str]] = []
    for linea in sistema.splitlines():
        if linea.startswith("INFORMACION DEL NEGOCIO"):
            dentro = True
            continue
        if dentro and linea and not linea.startswith(" "):
            break
        coincidencia = PATRON_FAQ.match(linea) if dentro else None
        if coincidencia:
            faq.append((coincidencia.group("pregunta"), coincidencia.group("respuesta")))
    return faq


@dataclass(slots=True)
class LLMFalso:
    zona_horaria: str = "America/Mexico_City"
    servicios: list[Servicio] = field(default_factory=list, init=False)
    faq: list[tuple[str, str]] = field(default_factory=list, init=False)
    servicio: Servicio | None = field(default=None, init=False)
    dia: date | None = field(default=None, init=False)
    personas: int = field(default=1, init=False)
    cliente: str | None = field(default=None, init=False)
    notas: list[str] = field(default_factory=list, init=False)
    opciones: list[Opcion] = field(default_factory=list, init=False)
    elegida: Opcion | None = field(default=None, init=False)
    espera_confirmacion: bool = field(default=False, init=False)
    espera_nombre: bool = field(default=False, init=False)
    reservado: bool = field(default=False, init=False)
    _dicho: set[str] = field(default_factory=set, init=False)

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.zona_horaria)

    async def responder(
        self,
        *,
        sistema: str,
        historial: Sequence[Elemento],
        herramientas: Sequence[dict[str, Any]] = (),
    ) -> RespuestaLLM:
        if not self.servicios:
            self.servicios = leer_servicios(sistema)
            self.faq = leer_faq(sistema)

        ultimo = historial[-1] if historial else None
        if isinstance(ultimo, TurnoResultados):
            return self._tras_herramienta(ultimo)
        if isinstance(ultimo, TurnoUsuario):
            return self._tras_cliente(ultimo.texto)
        return self._decir("Te escucho.")

    def _decir(self, texto: str) -> RespuestaLLM:
        if texto in self._dicho:
            texto = f"Va. {texto}"
        self._dicho.add(texto)
        return RespuestaLLM(texto=texto)

    @staticmethod
    def _llamar(nombre: str, argumentos: dict[str, Any], texto: str = "") -> RespuestaLLM:
        return RespuestaLLM(
            texto=texto,
            llamadas=(LlamadaHerramienta(id=uuid.uuid4().hex, nombre=nombre, argumentos=argumentos),),
        )

    def _tras_herramienta(self, turno: TurnoResultados) -> RespuestaLLM:
        contenido = " ".join(texto for _, texto in turno.resultados)

        if "Libre el" in contenido:
            self.opciones = [
                Opcion(m.group("hablado").strip(" :|"), m.group("inicio"), m.group("recurso"))
                for m in PATRON_OPCION.finditer(contenido)
            ]
            if not self.opciones:
                return self._decir("No me aparece nada libre. ¿Te busco otro dia?")
            primeras = self.opciones[:2]
            listado = " o a las ".join(o.hablado for o in primeras)
            return self._decir(f"Tengo a las {listado}. ¿Cual te late?")

        if "No hay nada libre" in contenido:
            self.opciones = []
            self.dia = None
            return self._decir("Ese dia ya lo tengo lleno. ¿Te busco otro dia cercano?")

        if "quedo apartado" in contenido:
            self.reservado = True
            codigo = PATRON_CODIGO.search(contenido)
            deletreado = codigo.group(1).strip() if codigo else ""
            return self._decir(
                f"Listo, ya quedo apartado. Tu codigo es {deletreado}. "
                "Te llega la confirmacion por WhatsApp. ¿Algo mas?"
            )

        if "se acaba de apartar" in contenido and self.servicio and self.dia:
            self.opciones = []
            return self._llamar(
                "consultar_disponibilidad",
                {
                    "servicio_id": self.servicio.id,
                    "fecha": self.dia.isoformat(),
                    "personas": self.personas,
                },
                "Uy, alguien se me adelanto. Dejame ver que mas hay.",
            )

        if "Transferido" in contenido:
            return self._decir("Ya te estoy pasando, dame un segundo.")

        if "No hay a quien transferir" in contenido:
            return self._decir(
                "Prefiero que esto lo vea alguien del equipo. Dejame tu numero y te marcan."
            )

        return self._decir("Dejame checar eso con el equipo.")

    def _tras_cliente(self, texto: str) -> RespuestaLLM:
        plano = normalizar(texto)

        motivo = self._motivo_escalamiento(plano)
        if motivo:
            return self._llamar(
                "transferir_a_humano",
                {"motivo": motivo},
                "Eso mejor te lo confirma alguien del equipo, no quiero decirte algo incorrecto.",
            )

        self._absorber(texto, plano)

        if self._pregunta_precio(plano):
            return self._responder_precio(plano)

        respuesta_faq = self._buscar_faq(texto)
        if respuesta_faq:
            return self._decir(respuesta_faq)

        if self.opciones and self.elegida is None:
            elegida = self._elegir_opcion(plano)
            if elegida is not None:
                self.elegida = elegida
            elif not self._afirma(plano):
                return self._decir("¿A que hora te acomoda mejor?")
            else:
                self.elegida = self.opciones[0]

        if self.elegida is not None and self.cliente is None:
            self.espera_nombre = True
            return self._decir("Perfecto. ¿A nombre de quien lo dejo?")

        if self.elegida is not None and self.cliente and not self.espera_confirmacion:
            self.espera_confirmacion = True
            servicio = self.servicio.nombre.lower() if self.servicio else "la cita"
            return self._decir(
                f"Entonces te confirmo: {servicio} a las {self.elegida.hablado}, "
                f"a nombre de {self.cliente}. ¿Lo aparto?"
            )

        if self.espera_confirmacion and self.elegida and self.servicio and self.cliente:
            if not self._afirma(plano):
                self.espera_confirmacion = False
                self.elegida = None
                return self._decir("Sin problema. ¿Que otra hora te sirve?")
            return self._llamar(
                "reservar",
                {
                    "servicio_id": self.servicio.id,
                    "recurso_id": self.elegida.recurso_id,
                    "inicio_iso": self.elegida.inicio_iso,
                    "nombre_cliente": self.cliente,
                    "personas": self.personas,
                    "notas": "; ".join(self.notas),
                },
                "Va, dejame apartarlo.",
            )

        if self.servicio is None:
            opciones = ", ".join(s.nombre.lower() for s in self.servicios[:3])
            return self._decir(f"Claro. ¿Que necesitas: {opciones}?")

        if self.dia is None:
            return self._decir(f"Va, {self.servicio.nombre.lower()}. ¿Para que dia lo quieres?")

        if not self.opciones:
            return self._llamar(
                "consultar_disponibilidad",
                {
                    "servicio_id": self.servicio.id,
                    "fecha": self.dia.isoformat(),
                    "personas": self.personas,
                },
                "Dejame checar tantito.",
            )

        return self._decir("¿Te ayudo con algo mas?")

    def _motivo_escalamiento(self, plano: str) -> str | None:
        for clave, motivo in ESCALAMIENTO.items():
            if clave in plano:
                return motivo
        return None

    def _absorber(self, texto: str, plano: str) -> None:
        if self.servicio is None:
            self.servicio = self._detectar_servicio(plano)
        if self.dia is None:
            self.dia = self._detectar_dia(plano)
        personas = self._detectar_personas(plano)
        if personas:
            self.personas = personas
        nombre = self._detectar_nombre(texto, plano)
        if nombre:
            self.cliente = nombre
            self.espera_nombre = False

    def _detectar_servicio(self, plano: str) -> Servicio | None:
        mejor: tuple[int, Servicio] | None = None
        for servicio in self.servicios:
            for termino in servicio.terminos:
                if termino and termino in plano and (mejor is None or len(termino) > mejor[0]):
                    mejor = (len(termino), servicio)
        if mejor:
            return mejor[1]
        if len(self.servicios) == 1 and any(
            palabra in plano for palabra in ("reserv", "mesa", "lugar", "cita", "apartar")
        ):
            return self.servicios[0]
        return None

    def _detectar_dia(self, plano: str) -> date | None:
        hoy = datetime.now(self.tz).date()
        if "pasado manana" in plano:
            return hoy + timedelta(days=2)
        if "manana" in plano:
            return hoy + timedelta(days=1)
        if "hoy" in plano or "ahorita" in plano or "ahora" in plano:
            return hoy
        for nombre, indice in DIAS_SEMANA.items():
            if nombre in plano:
                dia = hoy + timedelta(days=1)
                while dia.weekday() != indice:
                    dia += timedelta(days=1)
                return dia
        return None

    def _detectar_personas(self, plano: str) -> int | None:
        coincidencia = re.search(
            r"(?:para|somos|seriamos|de)\s+(\d{1,2}|" + "|".join(NUMEROS) + r")\b", plano
        )
        if coincidencia is None:
            return None
        crudo = coincidencia.group(1)
        valor = int(crudo) if crudo.isdigit() else NUMEROS[crudo]
        return valor if 1 <= valor <= 20 else None

    def _detectar_nombre(self, texto: str, plano: str) -> str | None:
        coincidencia = re.search(
            r"(?:me llamo|mi nombre es|a nombre de|soy)\s+(.+)$", texto, re.IGNORECASE
        )
        if coincidencia:
            return self._limpiar_nombre(coincidencia.group(1))
        if self.espera_nombre and 0 < len(plano.split()) <= 3:
            return self._limpiar_nombre(texto)
        return None

    @staticmethod
    def _limpiar_nombre(crudo: str) -> str:
        limpio = re.split(r"[,.;]| y | para | el | a las ", crudo.strip(), maxsplit=1)[0]
        return " ".join(p.capitalize() for p in limpio.split()[:3]) or "Cliente"

    @staticmethod
    def _pregunta_precio(plano: str) -> bool:
        return any(
            frase in plano
            for frase in ("cuanto cuesta", "cuanto sale", "cuanto vale", "cuanto es",
                          "que precio", "el precio", "cuanto me sale", "cuanto cobran")
        )

    def _responder_precio(self, plano: str) -> RespuestaLLM:
        servicio = self._detectar_servicio(plano) or self.servicio
        if servicio is None or servicio.precio is None:
            return self._decir(
                "Ese precio no lo tengo a la mano y no te quiero decir mal. "
                "¿Te paso con alguien del equipo?"
            )
        return self._decir(
            f"{servicio.nombre} cuesta {int(servicio.precio)} pesos. ¿Te lo agendo?"
        )

    def _buscar_faq(self, texto: str) -> str | None:
        palabras = _palabras(texto)
        if not palabras:
            return None
        mejor: tuple[int, str] | None = None
        for pregunta, respuesta in self.faq:
            comunes = len(palabras & _palabras(pregunta))
            if comunes >= 2 and (mejor is None or comunes > mejor[0]):
                mejor = (comunes, respuesta)
        return mejor[1] if mejor else None

    def _elegir_opcion(self, plano: str) -> Opcion | None:
        tokens = set(plano.split())
        if "primera" in tokens or "primero" in tokens:
            return self.opciones[0]
        if "segunda" in tokens or "segundo" in tokens:
            return self.opciones[min(1, len(self.opciones) - 1)]
        mejor: tuple[int, Opcion] | None = None
        for opcion in self.opciones:
            comunes = len(tokens & opcion.claves)
            if comunes and (mejor is None or comunes > mejor[0]):
                mejor = (comunes, opcion)
        return mejor[1] if mejor else None

    @staticmethod
    def _afirma(plano: str) -> bool:
        return bool(set(plano.split()) & AFIRMACIONES)
