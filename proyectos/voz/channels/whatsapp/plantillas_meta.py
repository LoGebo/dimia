"""Las plantillas que Meta tiene que aprobar para que la cola le escriba a
quien reservo por telefono.

    python -m channels.whatsapp.plantillas_meta          # estado de cada una
    python -m channels.whatsapp.plantillas_meta crear    # registra las que falten

Necesita `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_WABA_ID` (la WABA real de Dimia,
no la de prueba). Las de categoria UTILITY se aprueban en minutos; si Meta
las reclasifica como MARKETING hay que revisar el texto, no el codigo.
Los parametros se llenan en `app.despachador.plantilla_meta`, en este orden.
"""

from __future__ import annotations

import asyncio
import os
import sys

import httpx

from channels.whatsapp.config import whatsapp_settings

PLANTILLAS: list[dict] = [
    {
        "name": "cita_confirmacion_24h",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "{{1}}, mañana tienes {{2}} en {{3}}: {{4}}. Tu código es {{5}}. ¿Nos confirmas?",
                "example": {"body_text": [["Hola Ana", "consulta general", "Clínica Prueba", "jueves 3 de octubre a las 4:30 pm", "7QMB"]]},
            },
            {
                "type": "BUTTONS",
                "buttons": [
                    {"type": "QUICK_REPLY", "text": "Confirmo"},
                    {"type": "QUICK_REPLY", "text": "Cambiar"},
                    {"type": "QUICK_REPLY", "text": "Cancelar"},
                ],
            },
        ],
    },
    {
        "name": "pedido_listo_recoger",
        "language": "es_MX",
        "category": "UTILITY",
        "components": [
            {
                "type": "BODY",
                "text": "{{1}}, tu pedido {{2}} en {{3}} ya está listo para recoger.",
                "example": {"body_text": [["Hola Luis", "A1K4", "Tacos El Paisa"]]},
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
                "text": "{{1}}, tu pedido {{2}} de {{3}} ya va en camino. Llega en {{4}}.",
                "example": {"body_text": [["Hola Luis", "A1K4", "Tacos El Paisa", "unos 35 minutos"]]},
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
                print(f"{plantilla['name']:24} rechazada: {cuerpo.get('error', {}).get('message', cuerpo)}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(_principal(crear="crear" in sys.argv[1:])))
