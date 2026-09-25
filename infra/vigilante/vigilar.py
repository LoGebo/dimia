"""Vigilante externo (self-healing nivel 0, planeacion/aws-arquitectura-meta.md §3.10).

Corre en GitHub Actions cada 5 min, fuera de Fly, Vercel y Supabase. Solo lee:
no reinicia, no despliega, no toca la base. Si algo falla dos veces seguidas
(dos sondeos a 60 s dentro de la misma corrida) abre o actualiza un issue con
etiqueta `incidente` y, si hay llave, dispara PagerDuty. Cierra el issue (y
resuelve PagerDuty) solo cuando esa huella vuelve a estar sana.

Solo biblioteca estándar y `gh`. Todo se configura por entorno; un secreto que
falta es una falla visible, no una sonda que se salta (falla cerrado).

El detalle de una falla es solo el código HTTP o el nombre de la señal: los issues
y los logs de Actions de un repo público los ve cualquiera. Nunca el cuerpo de la
respuesta (trazas, nombres internos) ni las cifras de operación.
"""
from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import UTC, datetime

ETIQUETA = "incidente"
PREFIJO = "Incidente: "
ESPERA_SEG = 60
TIMEOUT_SEG = 10


def _get(url: str, encabezados: dict[str, str] | None = None) -> tuple[int, str]:
    peticion = urllib.request.Request(url, headers={"User-Agent": "dimia-vigilante", **(encabezados or {})})
    try:
        with urllib.request.urlopen(peticion, timeout=TIMEOUT_SEG) as r:
            return r.status, r.read(64 * 1024).decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(64 * 1024).decode(errors="replace")


def _salud(url: str) -> str | None:
    """None si contesta 200; si no, el porqué."""
    try:
        estado, _ = _get(url)
    except OSError as e:
        return f"sin respuesta: {e}"
    return None if estado == 200 else f"HTTP {estado}"


def _webhook_meta(base: str, token: str) -> str | None:
    """La misma verificación GET que hace Meta: tiene que devolver el reto tal cual."""
    if not token:
        return "falta el secreto WHATSAPP_VERIFY_TOKEN en el repositorio"
    reto = secrets.token_hex(8)
    consulta = urllib.parse.urlencode(
        {"hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": reto}
    )
    try:
        estado, cuerpo = _get(f"{base}/webhook/whatsapp?{consulta}")
    except OSError as e:
        return f"sin respuesta: {e}"
    if estado != 200 or cuerpo.strip() != reto:
        return f"HTTP {estado}: la verificación de Meta no devolvió el reto"
    return None


def _operacion(api: str, token: str) -> dict[str, str | None]:
    """Una huella por señal de salud_operacion (latidos, cola, llamadas, mensajes)."""
    if not token:
        return {"operacion": "falta el secreto SALUD_TOKEN en el repositorio"}
    try:
        estado, cuerpo = _get(f"{api}/salud/operacion", {"Authorization": f"Bearer {token}"})
        senales = json.loads(cuerpo)["senales"] if estado in (200, 503) else None
    except (OSError, ValueError, KeyError) as e:
        return {"operacion": f"sin respuesta legible: {e}"}
    if senales is None:
        return {"operacion": f"HTTP {estado}"}
    resultado: dict[str, str | None] = {"operacion": None}
    for s in senales:
        resultado[f"operacion:{s['senal']}"] = None if s["ok"] else "fuera de umbral"
    return resultado


def sondear(entorno: dict[str, str]) -> dict[str, str | None]:
    api = entorno["VIGILANTE_API_URL"].rstrip("/")
    webhooks = entorno["VIGILANTE_WEBHOOKS_URL"].rstrip("/")
    return {
        "dimia-api": _salud(f"{api}/salud"),
        "dimia-agentes": _salud(entorno["VIGILANTE_AGENTES_URL"].rstrip("/") + "/salud"),
        "agente-webhooks": _salud(f"{webhooks}/salud"),
        "agente-webhooks:meta": _webhook_meta(webhooks, entorno.get("WHATSAPP_VERIFY_TOKEN", "")),
        "panel": _salud(entorno["VIGILANTE_PANEL_URL"]),
        **_operacion(api, entorno.get("SALUD_TOKEN", "")),
        # Quién vigila al vigilante: sin «dead man's switch» esta corrida puede dejar
        # de llegar (GitHub apaga los cron sin actividad, o los salta) sin que nadie
        # se entere. Es parte mínima del nivel 0, no un extra.
        "vigilante": None if entorno.get("VIGILANTE_LATIDO_URL")
        else "falta el secreto VIGILANTE_LATIDO_URL en el repositorio",
    }


def planear(
    primera: dict[str, str | None],
    segunda: dict[str, str | None],
    abiertos: dict[str, int],
) -> tuple[dict[str, str], dict[str, int]]:
    """(incidentes a abrir o actualizar, issues a cerrar).

    Incidente: falló en los dos sondeos. Se cierra solo lo que el último sondeo
    vio sano; una huella que ni apareció (el endpoint no contestó) no se cierra.
    """
    fallas = {h: d for h, d in segunda.items() if d is not None and primera.get(h) is not None}
    cerrar = {h: n for h, n in abiertos.items() if h in segunda and segunda[h] is None}
    return fallas, cerrar


# --------------------------------------------------------------- efectos


def _gh(*args: str) -> str:
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout


def issues_abiertos() -> dict[str, int]:
    filas = json.loads(_gh("issue", "list", "--label", ETIQUETA, "--state", "open",
                           "--limit", "200", "--json", "number,title"))
    return {f["title"][len(PREFIJO):]: f["number"] for f in filas if f["title"].startswith(PREFIJO)}


def _cuerpo(huella: str, detalle: str, corrida: str) -> str:
    ahora = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"**Huella:** `{huella}`\n\n**Última falla:** {ahora}\n\n**Detalle:** {detalle}\n\n"
        f"**Corrida:** {corrida}\n\n"
        "Lo abrió el vigilante externo (`.github/workflows/vigilante.yml`) tras dos sondeos "
        "fallidos seguidos. Se cierra solo cuando la huella vuelve a estar sana. "
        "Runbooks en `infra/runbooks/`; ninguno se ejecuta solo."
    )


def _pagerduty(llave: str, accion: str, huella: str, resumen: str) -> None:
    cuerpo = {"routing_key": llave, "event_action": accion, "dedup_key": f"dimia-{huella}"}
    if accion == "trigger":
        cuerpo["payload"] = {"summary": resumen[:1000], "source": "vigilante", "severity": "critical"}
    peticion = urllib.request.Request(
        "https://events.pagerduty.com/v2/enqueue",
        data=json.dumps(cuerpo).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        urllib.request.urlopen(peticion, timeout=TIMEOUT_SEG).close()
    except OSError as e:
        print(f"PagerDuty no aceptó el evento de {huella}: {e}", file=sys.stderr)


def aplicar(fallas: dict[str, str], cerrar: dict[str, int], abiertos: dict[str, int],
            corrida: str, pagerduty: str) -> None:
    if fallas:
        _gh("label", "create", ETIQUETA, "--color", "B60205", "--force",
            "--description", "Falla detectada por el vigilante externo")
    for huella, detalle in fallas.items():
        cuerpo = _cuerpo(huella, detalle, corrida)
        if huella in abiertos:
            _gh("issue", "edit", str(abiertos[huella]), "--body", cuerpo)
        else:
            _gh("issue", "create", "--title", PREFIJO + huella, "--label", ETIQUETA, "--body", cuerpo)
        if pagerduty:
            _pagerduty(pagerduty, "trigger", huella, f"{huella}: {detalle}")
    for huella, numero in cerrar.items():
        _gh("issue", "close", str(numero), "--comment",
            f"Recuperado: `{huella}` volvió a estar sano. {corrida}")
        if pagerduty:
            _pagerduty(pagerduty, "resolve", huella, "")


def main() -> int:
    entorno = dict(os.environ)
    primera = sondear(entorno)
    segunda = primera
    if any(d is not None for d in primera.values()):
        time.sleep(ESPERA_SEG)
        segunda = sondear(entorno)
    for huella, detalle in sorted(segunda.items()):
        print(f"{'FALLA' if detalle else 'ok   '} {huella}")  # sin detalle: el log es público

    abiertos = issues_abiertos()
    fallas, cerrar = planear(primera, segunda, abiertos)
    aplicar(fallas, cerrar, abiertos, entorno.get("VIGILANTE_CORRIDA", ""),
            entorno.get("PAGERDUTY_ROUTING_KEY", ""))

    # El «dead man's switch» (healthchecks.io, latido de PagerDuty) avisa si esta
    # corrida deja de llegar. Si falta el secreto, sondear() ya abrió la huella.
    if latido := entorno.get("VIGILANTE_LATIDO_URL"):
        try:
            _get(latido)
        except OSError as e:
            print(f"no se pudo mandar el latido del vigilante: {e}", file=sys.stderr)
    # Corrida en rojo (y correo de GitHub) solo cuando se abre un incidente nuevo, no
    # cada 5 min mientras siga abierto: el issue ya avisó.
    return 1 if any(h not in abiertos for h in fallas) else 0


if __name__ == "__main__":
    sys.exit(main())
