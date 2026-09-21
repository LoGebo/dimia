"""Jev dentro del arnés: antes de cada llamada al modelo, decide si el siguiente paso del
agente es mecánico (seguir ejecutando lo ya decidido), pide razonar, o pide el modelo
profundo, y cambia el modelo de esa llamada. El primer paso del turno ya viene ruteado por
el orquestador (Jev sobre el mensaje del dueño); aquí se rutean los demás.

Se engancha en agent.chat_completion_helpers.build_api_kwargs (parche en la imagen). Lee
HERMES_HOME/dimia.json {url, token, rutas: {modelo: nivel}, modelos: {nivel: modelo}}; sin ese
archivo no hace nada. Nunca rompe la llamada: cualquier fallo deja el modelo como estaba."""
import hashlib
import json
import logging
import os
import sys
import time
import urllib.request

logger = logging.getLogger(__name__)

_conf: dict | None = None
_conf_mtime = 0.0
_cache: dict[str, tuple[float, str]] = {}  # huella del paso -> (cuándo, modelo)
ORDEN = ("ligero", "rapido", "fuerte", "profundo")


def _config() -> dict | None:
    global _conf, _conf_mtime
    ruta = os.path.join(os.environ.get("HERMES_HOME", ""), "dimia.json")
    try:
        m = os.stat(ruta).st_mtime
    except OSError:
        return None
    if m != _conf_mtime:
        with open(ruta) as f:
            _conf = json.load(f)
        _conf_mtime = m
    return _conf


def _texto(contenido) -> str:
    if isinstance(contenido, str):
        return contenido
    if isinstance(contenido, list):
        return " ".join(p.get("text", "") for p in contenido if isinstance(p, dict) and p.get("type") == "text")
    return ""


def _resumen(api_messages: list) -> tuple[str, str, int]:
    """(objetivo del turno, lo último que pasó, número de resultados de herramienta en el turno)."""
    objetivo, i_usuario = "", -1
    for i in range(len(api_messages) - 1, -1, -1):
        m = api_messages[i]
        if isinstance(m, dict) and m.get("role") == "user":
            objetivo, i_usuario = _texto(m.get("content"))[:1200], i
            break
    if i_usuario < 0:
        return "", "", 0
    ultimos = []
    resultados = 0
    for m in api_messages[i_usuario + 1:]:
        if not isinstance(m, dict):
            continue
        if m.get("role") == "tool" or m.get("type") == "function_call_output":
            resultados += 1
            ultimos.append(f"[resultado] {_texto(m.get('content') or m.get('output'))[:500]}")
        elif m.get("role") == "assistant":
            llamadas = m.get("tool_calls") or []
            for c in llamadas:
                fn = (c.get("function") or {}) if isinstance(c, dict) else {}
                ultimos.append(f"[llamó] {fn.get('name', '')}({str(fn.get('arguments', ''))[:200]})")
            t = _texto(m.get("content"))
            if t:
                ultimos.append(f"[dijo] {t[:300]}")
    return objetivo, "\n".join(ultimos[-6:]), resultados


def rutear(agent, api_messages: list, kwargs: dict) -> None:
    conf = _config()
    if not conf or not kwargs.get("model"):
        return
    actual = str(kwargs["model"])
    nivel_turno = (conf.get("rutas") or {}).get(actual)
    if not nivel_turno:
        return  # modelo fuera de la tabla (p. ej. auxiliar): no se toca
    objetivo, contexto, resultados = _resumen(api_messages)
    if resultados == 0:
        return  # primer paso: ya lo ruteó el orquestador con el mensaje del dueño
    huella = hashlib.sha1(f"{objetivo}|{contexto}".encode()).hexdigest()
    if huella in _cache and time.time() - _cache[huella][0] < 600:
        kwargs["model"] = _cache[huella][1]
        return
    cuerpo = json.dumps({"objetivo": objetivo, "contexto": contexto, "nivel_turno": nivel_turno, "paso": resultados}).encode()
    req = urllib.request.Request(conf["url"], data=cuerpo, headers={"Authorization": f"Bearer {conf['token']}", "Content-Type": "application/json"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=4) as r:
            d = json.load(r)
    except Exception as e:  # noqa: BLE001 — Jev caído = el modelo del turno
        logger.debug("jev paso: %s", e)
        return
    modelo = d.get("modelo")
    if not modelo:
        return
    _cache[huella] = (time.time(), modelo)
    if len(_cache) > 200:
        _cache.pop(next(iter(_cache)))
    if modelo != actual:
        print(f"[jev] paso {resultados}: {d.get('clase')} {d.get('confianza')} → {modelo} ({int((time.time() - t0) * 1000)} ms)", file=sys.stderr, flush=True)
    kwargs["model"] = modelo
