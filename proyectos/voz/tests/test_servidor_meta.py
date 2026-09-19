"""El proceso unico de webhooks reparte por prefijo sin recortar la ruta."""

from fastapi.testclient import TestClient

from channels import servidor
from channels.social.config import SocialSettings
from channels.whatsapp.config import WhatsAppSettings


def test_reparte_por_prefijo():
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


def test_un_cuerpo_gigante_se_rechaza_antes_de_leerlo():
    servidor.whatsapp.state.cfg = WhatsAppSettings(whatsapp_app_secret="s")
    http = TestClient(servidor.app)
    r = http.post("/webhook/whatsapp", content=b"x", headers={"content-length": str(300 * 1024)})
    assert r.status_code == 413
