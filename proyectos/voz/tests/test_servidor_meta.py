"""El proceso unico de webhooks reparte por prefijo sin recortar la ruta."""

from fastapi.testclient import TestClient

from app.supabase_client import agenda
from channels import servidor
from channels.social.config import SocialSettings
from channels.whatsapp.config import WhatsAppSettings


def test_reparte_por_prefijo(monkeypatch):
    monkeypatch.setattr(agenda, "base_viva", _base(True))
    servidor.whatsapp.state.cfg = WhatsAppSettings(whatsapp_verify_token="wa-token")
    servidor.social.state.cfg = SocialSettings(verify_token="ig-token")
    http = TestClient(servidor.app)

    def reto(ruta, token, n):
        return http.get(
            ruta, params={"hub.mode": "subscribe", "hub.verify_token": token, "hub.challenge": n}
        )

    assert reto("/webhook/whatsapp", "wa-token", "1").text == "1"
    assert reto("/webhook/social", "ig-token", "2").text == "2"
    # Cada canal valida con su propio token: el de WhatsApp no abre Instagram.
    assert reto("/webhook/social", "wa-token", "3").status_code == 403
    assert http.get("/salud").status_code == 200


def _base(viva: bool):
    async def base_viva(tope_seg: float = 2.0) -> bool:
        return viva

    return base_viva


def test_la_salud_de_fly_no_depende_de_la_base(monkeypatch):
    """Un parpadeo del pooler no saca a todas las maquinas del proxy: la platica
    sigue en memoria. La base se vigila aparte, en /salud/base."""
    http = TestClient(servidor.app)
    monkeypatch.setattr(agenda, "base_viva", _base(False))
    assert http.get("/salud").status_code == 200
    assert http.get("/salud/base").status_code == 503
    monkeypatch.setattr(agenda, "base_viva", _base(True))
    assert http.get("/salud/base").status_code == 200


def test_base_viva_no_se_cuelga_con_la_base_en_un_agujero_negro():
    import asyncio

    from app.supabase_client import Agenda

    class Colgado:
        async def fetchval(self, *a):
            await asyncio.sleep(10)

    async def probar():
        a = Agenda()
        a.adoptar_pool(Colgado())
        inicio = asyncio.get_running_loop().time()
        assert await a.base_viva(0.2) is False
        assert asyncio.get_running_loop().time() - inicio < 1

    asyncio.run(probar())


def test_un_cuerpo_gigante_se_rechaza_antes_de_leerlo():
    servidor.whatsapp.state.cfg = WhatsAppSettings(whatsapp_app_secret="s")
    http = TestClient(servidor.app)
    r = http.post("/webhook/whatsapp", content=b"x", headers={"content-length": str(300 * 1024)})
    assert r.status_code == 413
