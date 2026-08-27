"""El telefono en E.164, con la misma regla que `telefono_normalizado` en SQL.

Un numero que entra por SIP llega como `+52...` en `sip.phoneNumber` o como
`sip_+52...` en la identidad; por WhatsApp, como `5215...`. Todo lo que se
guarda o se busca por telefono pasa por aqui para que el cliente de la llamada
y el del WhatsApp sean el mismo.
"""

from __future__ import annotations

import re

_NO_DIGITOS = re.compile(r"\D")


def normalizar(crudo: str | None) -> str | None:
    if crudo is None:
        return None
    d = _NO_DIGITOS.sub("", crudo)
    if len(d) < 8:
        return None
    if len(d) == 10:
        return "+52" + d
    if len(d) == 13 and d.startswith("521"):
        return "+52" + d[3:]
    return "+" + d
