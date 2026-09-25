#!/usr/bin/env python3
"""Qué pilas de OpenTofu tocó un cambio, para la matriz de CI.

Uso: git diff --name-only BASE HEAD | python3 pilas.py [--solo-ci] [--pr]
     python3 pilas.py --solo-ci --todas
Imprime una lista JSON de {pila, id, cuenta, entorno}. Un cambio en modulos/ o politicas/
toca todas las pilas. Las pilas sin cuenta se omiten: la cuenta aún no existe.
--solo-ci deja fuera las pilas que aplica el dueño a mano.
--pr deja solo las pilas cuya cuenta acepta el plan desde un PR (plan_en_pr, igual que en su base).
--todas ignora el diff: el apply de main planea todas y aplica solo las que cambian.
"""

import json
import re
import sys
from pathlib import Path

RAIZ = "infra/aws/"
COMPARTIDO = ("modulos/", "politicas/")


def pilas(cambios: list[str] | None, registro: dict, solo_ci: bool = False, pr: bool = False) -> list[dict]:
    """cambios=None: todas las pilas."""
    conocidas = {k: v for k, v in registro.items() if not k.startswith("_")}
    rel = [c[len(RAIZ):] for c in cambios or [] if c.startswith(RAIZ)]
    if cambios is None or any(r.startswith(COMPARTIDO) for r in rel):
        tocadas = set(conocidas)
    else:
        tocadas = {p for p in conocidas for r in rel if r.startswith(p + "/")}
    salida = []
    for p in sorted(tocadas):
        cuenta = conocidas[p]["cuenta"]
        if not re.fullmatch(r"[0-9]{12}", cuenta):
            continue
        if solo_ci and conocidas[p]["aplica"] != "ci":
            continue
        # Falla cerrado: sin la marca, tofu-plan de esa cuenta no confía en el claim de PR.
        if pr and conocidas[p].get("plan_en_pr") is not True:
            continue
        if solo_ci and not conocidas[p].get("entorno"):
            # Falla cerrado: sin environment no hay revisor humano antes del apply.
            raise SystemExit(f"{p}: se aplica por CI pero no tiene environment")
        salida.append({"pila": p, "id": p.replace("/", "-"), "cuenta": cuenta, "entorno": conocidas[p].get("entorno", "")})
    return salida


def _probar() -> None:
    reg = {
        "_nota": "",
        "vivos/a": {"cuenta": "111111111111", "aplica": "ci", "entorno": "infra-a", "plan_en_pr": True},
        "vivos/a-base": {"cuenta": "111111111111", "aplica": "manual"},
        "vivos/b": {"cuenta": "", "aplica": "ci"},
    }
    assert pilas(["infra/aws/vivos/a/main.tf"], reg) == [{"pila": "vivos/a", "id": "vivos-a", "cuenta": "111111111111", "entorno": "infra-a"}]
    # «vivos/a» no debe arrastrar a «vivos/a-base» por prefijo.
    assert [x["pila"] for x in pilas(["infra/aws/vivos/a-base/x.tf"], reg)] == ["vivos/a-base"]
    assert [x["pila"] for x in pilas(["infra/aws/modulos/red-celda/main.tf"], reg)] == ["vivos/a", "vivos/a-base"]
    assert [x["pila"] for x in pilas(["infra/aws/politicas/scp/base.json"], reg, solo_ci=True)] == ["vivos/a"]
    assert pilas(["infra/aws/vivos/b/main.tf", "sitio/x.ts"], reg) == []
    # En un PR solo se planean las cuentas que aceptan el claim :pull_request.
    assert [x["pila"] for x in pilas(["infra/aws/modulos/x.tf"], reg, pr=True)] == ["vivos/a"]
    # El apply de main no depende del diff: un push perdido no deja pilas sin aplicar.
    assert [x["pila"] for x in pilas(None, reg, solo_ci=True)] == ["vivos/a"]
    assert [x["pila"] for x in pilas([], reg)] == []
    reg["vivos/a"]["entorno"] = ""
    try:
        pilas(["infra/aws/vivos/a/main.tf"], reg, solo_ci=True)
        raise AssertionError("una pila de CI sin environment debe fallar")
    except SystemExit:
        pass
    print("pilas.py: pruebas en verde")


if __name__ == "__main__":
    if "--probar" in sys.argv:
        _probar()
        sys.exit(0)
    registro = json.loads((Path(__file__).parent / "pilas.json").read_text())
    cambios = None if "--todas" in sys.argv else [l.strip() for l in sys.stdin if l.strip()]
    print(json.dumps(pilas(cambios, registro, "--solo-ci" in sys.argv, "--pr" in sys.argv)))
