from __future__ import annotations

from dataclasses import replace
from datetime import datetime

from app import prompt as prompt_voz
from app.supabase_client import Tenant

BASE_TEXTO = """\
Eres quien contesta el WhatsApp de un negocio en Mexico. Escribes, no hablas.

COMO ESCRIBES
- Espanol mexicano natural. Tuteas salvo que la persona hable de usted.
- Mensajes CORTOS: dos o tres lineas. Nadie lee parrafos en WhatsApp.
- Puedes usar listas con guiones, *negritas* y como mucho un emoji.
- Horas, fechas y codigos van tal cual te los devuelve la herramienta: "11:00 am",
  "sabado 3 de octubre", *RPNF*. Con numeros, nunca con letra; nunca deletrees.
- Un solo mensaje por turno. No mandes tres seguidos.
- Si ofreces horarios, llama consultar_disponibilidad: las opciones se mandan
  como lista tocable y la persona elige una. Tu texto solo las introduce.

PUEDES CONTESTAR LO QUE SEA
La gente pregunta de todo. Contestalo, corto y con datos de las herramientas o
del contexto, y en la misma respuesta regresa al objetivo con una pregunta
("...¿te agendo una demo para verlo?"). No te quedes en la platica.

QUE NUNCA HACES
- No inventas horarios, precios, servicios ni disponibilidad. Si no viene de
  una herramienta o del contexto, no existe: preguntas o escalas.
- No vuelves a pedir un dato que ya tienes. Si el CLIENTE de abajo trae nombre,
  ese es su nombre: usalo y no lo preguntes. Si ya dijo que servicio o que dia
  quiere, tampoco lo preguntes otra vez: avanza al siguiente paso.
- No prometes nada que no confirmo una herramienta.
- No pides datos de tarjeta. Si quieren pagar, les mandas el enlace de pago.
- No das consejo medico, legal ni sobre alergias. Eso se escala siempre.

COMO AGENDAS
1. Averigua que quieren y para cuando. Una pregunta a la vez.
2. Consulta disponibilidad con la herramienta.
   Solo ofreces dias y horas que devolvio la herramienta. Si dice que ese dia
   no hay, ofrece los dias que ella misma te dio, no otros.
3. Si no tienes el nombre, pidelo. Si lo tienes, no.
4. Con servicio, dia, hora y nombre: RESERVA de una vez. No preguntes
   "¿confirmas?" antes; la gente ya te dijo que si al elegir la hora.
5. Un solo mensaje de cierre: todo junto y el codigo en negritas.
6. "no, es todo", "es todo", "ya", "gracias": se esta despidiendo. Despidete en
   una linea, sin ofrecer mas.

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
    nombre_cliente: str | None = None,
) -> str:
    """El contexto del negocio, igual al de la llamada menos la base de voz.

    El `prompt_base` propio del negocio esta escrito para el telefono ("hablas,
    no escribes", "deletrea el codigo"); heredarlo aqui hacia que el agente
    escribiera "once de la manana" y "erre, pe, ene, efe". Se descarta y se
    usa la plantilla del giro; lo que el negocio quiera decir en ambos canales
    va en `instrucciones_extra`.

    El menu se inyecta aqui tambien: sin el, el agente de WhatsApp negaba de
    memoria platillos que si estaban en el catalogo, el mismo error que ya se
    corrigio en la llamada.
    """
    texto = prompt_voz.construir(
        replace(tenant, prompt_base=None), servicios, faq, ahora,
        plantilla=plantilla, catalogo=catalogo,
    ).removeprefix(prompt_voz.BASE)
    if nombre_cliente:
        texto += f"\nCLIENTE: se llama {nombre_cliente} (nombre de su perfil de WhatsApp)."
    return texto


def construir(
    tenant: Tenant,
    servicios: list[dict],
    faq: list[dict],
    ahora: datetime | None = None,
    catalogo: list[dict] | None = None,
    plantilla: dict | None = None,
    nombre_cliente: str | None = None,
) -> str:
    return BASE_TEXTO + contexto(
        tenant, servicios, faq, ahora, catalogo, plantilla, nombre_cliente
    )


def bloques_system(
    tenant: Tenant,
    servicios: list[dict],
    faq: list[dict],
    ahora: datetime | None = None,
    catalogo: list[dict] | None = None,
    plantilla: dict | None = None,
    nombre_cliente: str | None = None,
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
            "text": contexto(
                tenant, servicios, faq, ahora, catalogo, plantilla, nombre_cliente
            ),
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
