"""Navegador rápido: Jev elige la operación y el elemento en cada paso
(jev-ultrafast, de Browser Use); un modelo chico solo escribe texto cuando
hace falta. Corre como servidor MCP (stdio) dentro de la máquina del negocio,
sobre el Chromium de la pantalla del agente (BU_CDP_URL). Cuesta centavos por
tarea y no gasta el cupo de ChatGPT del negocio."""
import json
import os
import time

from mcp.server.mcpserver import MCPServer

import jev_ultrafast.model as modelo
from browser_harness.helpers import cdp
from jev_ultrafast.agent import Agent

# --- Jev por Vercel AI Gateway (misma respuesta) y modelo de texto por la misma puerta ---
_post = modelo.post_json
VERCEL = os.environ.get("VERCEL_AI_GATEWAY_KEY", "")


def post_json(url, key, body):
    if VERCEL and "typesafe.ai" in url:
        body = {**body, "model": "typesafe-ai/jev"}
        return _post("https://ai-gateway.vercel.sh/v1/evaluate", VERCEL, body)
    if "ai-gateway.vercel.sh" in url:  # el helper de texto: sin claves de razonamiento que la puerta no conoce
        body = {k: v for k, v in body.items() if k not in ("reasoning", "thinking")}
    return _post(url, key, body)


modelo.post_json = post_json

servidor = MCPServer("navegador_rapido", instructions="Navega sitios con un objetivo concreto, rápido y barato. Deja la pestaña abierta para que el agente siga con browser_snapshot si hace falta.")


@servidor.tool(name="navegar_rapido", description="Abre una URL en la pantalla del agente y cumple un objetivo concreto (buscar, filtrar, abrir, llenar) paso a paso con Jev. Devuelve el estado final, el texto visible y los pasos. Úselo para tareas de navegación con objetivo claro; para leer una página use browser_snapshot.")
def navegar_rapido(url: str, objetivo: str, max_pasos: int = 40) -> str:
    inicio = time.perf_counter()
    try:
        agente = Agent(url, objetivo)
    except Exception as e:  # noqa: BLE001
        return f"No pude abrir {url}: {e}"
    pasos = []
    try:
        for estado in agente.run():
            d = estado.get("decision") or {}
            if d.get("operation"):
                pasos.append(f"{d['operation']} {d.get('target_label', '')}".strip())
            if len(pasos) >= max_pasos:
                break
        try:
            cdp("Target.activateTarget", targetId=agente.browser.target)  # que se vea en la pantalla
        except Exception:  # noqa: BLE001
            pass
        pagina = agente.state.get("page") or {}
        resultado = {
            "estado": agente.state.get("status"),
            "url": pagina.get("url"), "titulo": pagina.get("title"),
            "texto_visible": (pagina.get("text") or "")[:4000],
            "pasos": pasos[-30:], "segundos": round(time.perf_counter() - inicio, 1),
        }
        return json.dumps(resultado, ensure_ascii=False)
    except Exception as e:  # noqa: BLE001
        return f"Se detuvo tras {len(pasos)} pasos: {e}"
    # la pestaña se queda abierta a propósito


if __name__ == "__main__":
    servidor.run("stdio")
