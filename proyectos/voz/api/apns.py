"""Manda a APNs los avisos nuevos. Corre dentro de dimia-api; con varias máquinas, `skip locked`
evita que un aviso salga dos veces. Cada aviso llega a los iPhone de todos los miembros del negocio."""
from __future__ import annotations

import asyncio
import logging
import time

import httpx
import jwt

from api.config import api_settings
from api.db import base, en_negocio

log = logging.getLogger("apns")
SERVIDOR = {"produccion": "https://api.push.apple.com", "sandbox": "https://api.sandbox.push.apple.com"}
_ficha: tuple[float, str] | None = None


def _token() -> str:
    """El JWT de APNs dura una hora; Apple pide renovarlo entre 20 y 60 minutos."""
    global _ficha
    a = api_settings()
    if _ficha is None or time.time() - _ficha[0] > 40 * 60:
        _ficha = (time.time(), jwt.encode({"iss": a.apns_equipo, "iat": int(time.time())}, a.apns_llave.replace("\\n", "\n"),
                                          algorithm="ES256", headers={"kid": a.apns_llave_id}))
    return _ficha[1]


def carga(a: dict) -> dict:
    return {
        "aps": {"alert": {"title": a["titulo"], "body": a["cuerpo"]}, "sound": "default", "thread-id": a["tipo"].split(".")[0]},
        "aviso_id": a["id"], "tipo": a["tipo"], "enlace": a["enlace"], "tenant_id": str(a["tenant_id"]),
    }


async def _vuelta(cliente: httpx.AsyncClient, solo_tenant=None) -> int:
    """Negocio por negocio: la API no ve avisos ajenos, solo pregunta cuáles tienen pendientes."""
    if solo_tenant is None:
        enviados = 0
        for fila in await base.fetch("select avisos_por_empujar() as tenant_id"):
            enviados += await _vuelta(cliente, fila["tenant_id"])
        return enviados
    with en_negocio(solo_tenant):
        return await _vuelta_del_negocio(cliente, solo_tenant)


async def _vuelta_del_negocio(cliente: httpx.AsyncClient, solo_tenant) -> int:
    a = api_settings()
    async with base.transaccion() as c:
        avisos = await c.fetch(
            """select id, tenant_id, tipo, titulo, cuerpo, enlace from aviso
                where push_en is null and creado > now() - interval '10 minutes'
                  and ($1::uuid is null or tenant_id = $1)
                order by id limit 50 for update skip locked""", solo_tenant)
        for av in avisos:
            destinos = await c.fetch(
                """select d.token, d.entorno from dispositivo d
                    join tenant_member m on m.user_id = d.user_id and m.tenant_id = $1
                   where d.activo and d.plataforma = 'ios'""", av["tenant_id"])
            for d in destinos:
                r = await cliente.post(f"{SERVIDOR[d['entorno']]}/3/device/{d['token']}", json=carga(dict(av)), headers={
                    "authorization": f"bearer {_token()}", "apns-topic": a.apns_tema, "apns-push-type": "alert",
                    "apns-priority": "10", "apns-collapse-id": str(av["id"])})
                if r.status_code == 410 or (r.status_code == 400 and r.json().get("reason") in ("BadDeviceToken", "DeviceTokenNotForTopic")):
                    await c.execute("update dispositivo set activo = false where token = $1", d["token"])
                elif r.status_code != 200:
                    log.warning("apns %s %s: %s", r.status_code, d["token"][:8], r.text[:200])
            await c.execute("update aviso set push_en = now() where id = $1", av["id"])
        return len(avisos)


async def ciclo() -> None:
    if not api_settings().apns_llave:
        log.info("sin APNS_LLAVE: no se mandan push")
        return
    async with httpx.AsyncClient(http2=True, timeout=10) as cliente:
        while True:
            try:
                await _vuelta(cliente)
            except Exception:
                log.exception("apns: la vuelta falló")
            await asyncio.sleep(5)
