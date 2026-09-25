"""python3 -m unittest discover infra/vigilante"""
import unittest
from unittest import mock

import vigilar
from vigilar import planear


class Planear(unittest.TestCase):
    def test_una_sola_falla_no_abre_incidente(self):
        fallas, _ = planear({"panel": "HTTP 502"}, {"panel": None}, {})
        self.assertEqual(fallas, {})

    def test_dos_fallas_seguidas_abren_con_el_ultimo_detalle(self):
        fallas, _ = planear({"panel": "HTTP 502"}, {"panel": "HTTP 504"}, {})
        self.assertEqual(fallas, {"panel": "HTTP 504"})

    def test_se_cierra_solo_lo_que_el_ultimo_sondeo_vio_sano(self):
        abiertos = {"panel": 7, "operacion:voz_latido_seg": 8, "dimia-api": 9}
        # El endpoint de operación no contestó: sus señales no aparecen y no se cierran.
        segunda = {"panel": None, "dimia-api": "HTTP 500", "operacion": "sin respuesta"}
        _, cerrar = planear(segunda, segunda, abiertos)
        self.assertEqual(cerrar, {"panel": 7})


ENTORNO = {"VIGILANTE_API_URL": "https://api", "VIGILANTE_AGENTES_URL": "https://ag",
           "VIGILANTE_WEBHOOKS_URL": "https://wh", "VIGILANTE_PANEL_URL": "https://panel",
           "SALUD_TOKEN": "t", "WHATSAPP_VERIFY_TOKEN": "v"}


class Sondear(unittest.TestCase):

    def test_el_detalle_no_publica_el_cuerpo_ni_las_cifras(self):
        def get(url, encabezados=None):
            if url.endswith("/salud/operacion"):
                return 503, '{"senales": [{"senal": "cola_atraso_seg", "valor": 999, "umbral": 300, "ok": false}]}'
            return 500, "Traceback: asyncpg tenant_id secreto"

        with mock.patch.object(vigilar, "_get", get):
            r = vigilar.sondear({**ENTORNO, "VIGILANTE_LATIDO_URL": "https://hc"})
        self.assertEqual(r["panel"], "HTTP 500")
        self.assertEqual(r["operacion:cola_atraso_seg"], "fuera de umbral")
        self.assertIsNone(r["vigilante"])
        self.assertNotIn("secreto", repr(r))
        self.assertNotIn("999", repr(r))

    def test_sin_dead_mans_switch_es_una_falla(self):
        with mock.patch.object(vigilar, "_get", lambda *a, **k: (200, "")):
            r = vigilar.sondear(ENTORNO)
        self.assertIn("VIGILANTE_LATIDO_URL", r["vigilante"])


class Salida(unittest.TestCase):
    def _main(self, abiertos):
        falla = {"panel": "HTTP 502", "vigilante": None}
        with mock.patch.object(vigilar, "sondear", return_value=falla), \
             mock.patch.object(vigilar, "issues_abiertos", return_value=abiertos), \
             mock.patch.object(vigilar, "aplicar"), mock.patch.object(vigilar.time, "sleep"), \
             mock.patch.dict(vigilar.os.environ, {}, clear=True):
            return vigilar.main()

    def test_rojo_solo_al_abrir_un_incidente_nuevo(self):
        self.assertEqual(self._main({}), 1)
        self.assertEqual(self._main({"panel": 7}), 0)


if __name__ == "__main__":
    unittest.main()
