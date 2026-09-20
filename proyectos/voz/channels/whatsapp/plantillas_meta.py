"""Las plantillas que Meta tiene que aprobar para que la cola le escriba a
quien reservo por telefono.

    python -m channels.whatsapp.plantillas_meta          # estado de cada una
    python -m channels.whatsapp.plantillas_meta crear    # registra las que falten

Necesita `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_WABA_ID` (la WABA real de Dimia,
no la de prueba). Las de categoria UTILITY se aprueban en minutos; si Meta
las reclasifica como MARKETING hay que revisar el texto, no el codigo.
Los parametros se llenan en `app.despachador.plantilla_meta`, en este orden.
Meta no acepta una variable al inicio ni al final del cuerpo, y rechaza por
"categoria incorrecta" redacciones que se alejan de las ya aprobadas: copiar
la forma de `recordatorio_cita` fue lo que paso. Un nombre borrado no se puede
reutilizar en semanas; si hay que cambiar el texto, es un nombre nuevo.
"""

from __future__ import annotations

import asyncio
import os
import sys

import httpx

from channels.whatsapp.config import whatsapp_settings

PLANTILLAS: list[dict] = [
    {
        "name": "cita_confirmar_24h_botones",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "Hola {{1}}, te recordamos tu cita mañana {{2}} a las {{3}} en {{4}}. Código {{5}}. ¿Nos confirmas?",
                "example": {"body_text": [["Ana", "lunes 5 de mayo", "3:30 pm", "Clínica Dental Aurora", "A7K2"]]},
            },
            {
                "type": "BUTTONS",
                "buttons": [
                    {"type": "QUICK_REPLY", "text": "Confirmar"},
                    {"type": "QUICK_REPLY", "text": "Cancelar"},
                    {"type": "QUICK_REPLY", "text": "Reagendar"},
                ],
            },
        ],
    },
    {
        "name": "confirmacion_cita",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "Hola {{1}}, tu cita en {{2}} quedó el {{3}} a las {{4}}. Código {{5}}. Responde CANCELAR si no podrás.",
                "example": {"body_text": [["Ana", "Clínica Dental Aurora", "lunes 5 de mayo", "3:30 pm", "A7K2"]]},
            }
        ],
    },
    {
        "name": "resena",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "Hola {{1}}, gracias por venir a {{2}}. Del 1 al 5, ¿cómo te fue? Responde con el número.",
                "example": {"body_text": [["Ana", "Clínica Dental Aurora"]]},
            }
        ],
    },
    {
        "name": "pago_pendiente",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "Hola {{1}}, tienes un pago pendiente de ${{2}} en {{3}}. Puedes pagar aquí: {{4}} . Si ya pagaste, ignora este mensaje.",
                "example": {"body_text": [["Ana", "850", "Clínica Dental Aurora", "https://pago.dimia.mx/abc123"]]},
            }
        ],
    },
    {
        "name": "pedido_listo_recoger",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "Hola {{1}}. Tu pedido {{2}} en {{3}} ya está listo para recoger.",
                "example": {"body_text": [["Luis", "A1K4", "Tacos El Paisa"]]},
            }
        ],
    },
    {
        "name": "pedido_en_camino",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "Hola {{1}}. Tu pedido {{2}} de {{3}} ya va en camino y llega en {{4}} aproximadamente.",
                "example": {"body_text": [["Luis", "A1K4", "Tacos El Paisa", "unos 35 minutos"]]},
            }
        ],
    },
]


async def _principal(crear: bool) -> int:
    cfg = whatsapp_settings()
    waba = os.environ.get("WHATSAPP_WABA_ID", "")
    if not cfg.whatsapp_access_token or not waba:
        print("faltan WHATSAPP_ACCESS_TOKEN o WHATSAPP_WABA_ID")
        return 1
    base = f"{cfg.whatsapp_graph_url.rstrip('/')}/{cfg.whatsapp_api_version}/{waba}/message_templates"
    cabeceras = {"authorization": f"Bearer {cfg.whatsapp_access_token}"}
    async with httpx.AsyncClient(timeout=30.0, headers=cabeceras) as http:
        existentes = (await http.get(base, params={"fields": "name,status,category", "limit": 200})).json()
        estado = {p["name"]: p for p in existentes.get("data", [])}
        for plantilla in PLANTILLAS:
            actual = estado.get(plantilla["name"])
            if actual is not None:
                print(f"{plantilla['name']:24} {actual.get('status')} ({actual.get('category')})")
                continue
            if not crear:
                print(f"{plantilla['name']:24} no existe")
                continue
            respuesta = await http.post(base, json=plantilla)
            cuerpo = respuesta.json()
            if respuesta.is_success:
                print(f"{plantilla['name']:24} creada: {cuerpo.get('status')}")
            else:
                error = cuerpo.get("error", {})
                print(f"{plantilla['name']:24} rechazada: {error.get('error_user_msg') or error.get('message') or cuerpo}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_principal(crear="crear" in sys.argv[1:])))
