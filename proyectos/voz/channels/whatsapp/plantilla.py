from __future__ import annotations

from datetime import datetime

from app import prompt as prompt_voz
from app.supabase_client import Tenant

BASE_TEXTO = """\
Eres quien contesta el WhatsApp de un negocio en Mexico. Escribes, no hablas.

COMO ESCRIBES
- Espanol mexicano natural. Tuteas salvo que la persona hable de usted.
- Mensajes CORTOS: dos o tres lineas. Nadie lee parrafos en WhatsApp.
- Puedes usar listas con guiones, *negritas* y como mucho un emoji.
- Escribe las horas como se leen: "3:30 pm". Las fechas como "lunes 5 de mayo".
- Un solo mensaje por turno. No mandes tres seguidos.
- Si ofreces horarios, llama consultar_disponibilidad: las opciones se mandan
  como lista tocable y la persona elige una. Tu texto solo las introduce.

QUE NUNCA HACES
- No inventas horarios, precios, servicios ni disponibilidad. Si no viene de
  una herramienta o del contexto, no existe: preguntas o escalas.
- No prometes nada que no confirmo una herramienta.
- No pides datos de tarjeta. Si quieren pagar, les mandas el enlace de pago.
- No das consejo medico, legal ni sobre alergias. Eso se escala siempre.

COMO AGENDAS
1. Averigua que quieren y para cuando. Una pregunta a la vez.
2. Consulta disponibilidad con la herramienta.
3. Pide el nombre si no lo tienes.
4. ANTES de reservar, repite servicio, dia, hora y nombre, y pide un si.
5. Reserva y manda el codigo.

CUANDO ESCALAS (usa escalar_a_humano)
- Queja, reclamo, o persona molesta.
- Alergias, urgencia medica, cualquier tema de salud delicado.
- Piden algo fuera de lo que puedes hacer, o piden hablar con alguien.

Si te preguntan si eres una persona, contestas con naturalidad que eres el
asistente virtual del negocio. No lo niegas ni lo escondes.
"""


def contexto(
    tenant: Tenant,
    servicios: list[dict],
    faq: list[dict],
    ahora: datetime | None = None,
    catalogo: list[dict] | None = None,
    plantilla: dict | None = None,
) -> str:
    """El contexto del negocio, igual al de la llamada menos la base de voz.

    El menu se inyecta aqui tambien: sin el, el agente de WhatsApp negaba de
    memoria platillos que si estaban en el catalogo, el mismo error que ya se
    corrigio en la llamada.
    """
    return prompt_voz.construir(
        tenant, servicios, faq, ahora, plantilla=plantilla, catalogo=catalogo
    ).removeprefix(prompt_voz.BASE)


def construir(
    tenant: Tenant,
    servicios: list[dict],
    faq: list[dict],
    ahora: datetime | None = None,
    catalogo: list[dict] | None = None,
    plantilla: dict | None = None,
) -> str:
    return BASE_TEXTO + contexto(tenant, servicios, faq, ahora, catalogo, plantilla)


def bloques_system(
    tenant: Tenant,
    servicios: list[dict],
    faq: list[dict],
    ahora: datetime | None = None,
    catalogo: list[dict] | None = None,
    plantilla: dict | None = None,
) -> list[dict]:
    """La base va en su propio bloque para que Anthropic la cachee.

    El contexto del negocio cambia con cada edicion del panel; la base no.
    """
    return [
        {
            "type": "text",
            "text": BASE_TEXTO,
            "cache_control": {"type": "ephemeral"},
        },
        {
            "type": "text",
            "text": contexto(tenant, servicios, faq, ahora, catalogo, plantilla),
        },
    ]


SALUDOS = {
    "clinica": "{nombre}, buen dia. ¿En que le puedo ayudar?",
    "restaurante": "{nombre}, ¡hola! ¿Te ayudo con una reservacion?",
    "salon": "{nombre}, ¡hola! ¿Que necesitas?",
    "generico": "{nombre}, buen dia. ¿En que le ayudo?",
}


def saludo(tenant: Tenant) -> str:
    return SALUDOS.get(tenant.vertical, SALUDOS["generico"]).format(
        nombre=tenant.nombre
    )
