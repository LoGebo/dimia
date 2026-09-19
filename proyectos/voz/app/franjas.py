"""'En la manana', 'en la noche', '4:30': la hora pedida a un rango de busqueda.

Lo usan la llamada y los canales de texto; antes vivia solo en el agente de
voz y WhatsApp ofrecia la 1 de la tarde a quien pidio 'en la noche'.
"""

from __future__ import annotations

from datetime import time as dtime

FRANJAS = {
    "manana": (dtime(6, 0), dtime(11, 59)),
    "mañana": (dtime(6, 0), dtime(11, 59)),
    "mediodia": (dtime(12, 0), dtime(14, 59)),
    "tarde": (dtime(13, 0), dtime(18, 59)),
    "noche": (dtime(19, 0), dtime(23, 59)),
}


def franja_a_horas(franja: str) -> tuple[dtime | None, dtime | None]:
    clave = franja.strip().lower()
    if not clave:
        return None, None
    if clave in FRANJAS:
        return FRANJAS[clave]
    for sep in (":", "."):
        if sep in clave:
            try:
                h, m = clave.split(sep)[:2]
                pedida = dtime(int(h), int(m))
                return pedida, None
            except ValueError:
                break
    if clave.isdigit():
        try:
            return dtime(int(clave), 0), None
        except ValueError:
            pass
    return None, None
