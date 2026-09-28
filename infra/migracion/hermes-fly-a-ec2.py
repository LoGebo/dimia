"""Muda la casa de Hermes de un negocio de Fly a EC2 (paso 8), con su disco: logins, perfiles,
sesiones de WhatsApp y archivos de los agentes.

Corre dentro del pod del orquestador ya con PROVEEDOR_MAQUINAS=ec2 (necesita FLY_API_TOKEN y
EC2_*). El disco viaja por S3 con dos URL prefirmadas que genera quien opera (el orquestador no
tiene permisos de S3):

    kubectl -n prod exec deploy/agentes -- sh -c 'cd /srv && PYTHONPATH=/srv python /tmp/mudar.py <tenant> "<put>" "<get>"'

La máquina de Fly queda apagada, con su volumen: es la reversa. Se borra a los 7 días.
"""
import asyncio
import shlex
import sys

from agentes import config, db, hermes, negocio
from agentes.maquinas import proveedor
from agentes.maquinas.fly import Fly


async def main(tenant: str, put: str, get: str) -> None:
    m = await db.uno("select * from maquina_negocio where tenant_id = $1", tenant)
    assert m and m["proveedor"] == "fly", f"{tenant}: no tiene casa en Fly"
    fly, ec2 = Fly(), proveedor()
    assert ec2.nombre == "ec2", "el orquestador todavía usa Fly"

    await fly.arrancar(m["referencia"])
    c, out, err = await fly.ejecutar(m["referencia"], ["sh", "-c",
        f"tar czf /tmp/datos.tgz -C {hermes.HOME} . && ls -l /tmp/datos.tgz && curl -sf -T /tmp/datos.tgz {shlex.quote(put)} && rm /tmp/datos.tgz"], timeout=900)
    assert c == 0, f"no subió el disco: {out} {err}"
    print("disco en S3:", out.split()[4], "bytes", flush=True)
    await fly.parar(m["referencia"])

    n = len(await negocio._agentes(tenant))
    casa = await negocio._crear_casa(tenant, n)
    c, out, err = await ec2.ejecutar(casa.referencia, ["sh", "-c",
        f"curl -sf {shlex.quote(get)} | tar xzf - -C {hermes.HOME} && chown -R {hermes.UID}:{hermes.UID} {hermes.HOME} && du -sh {hermes.HOME}"], timeout=900)
    assert c == 0, f"no bajó el disco: {out} {err}"
    print("disco en EC2:", out.strip(), flush=True)

    # perfiles vacío: el siguiente turno reescribe los config.yaml con el proxy de AWS.
    await db.ejecutar("update maquina_negocio set proveedor = $2, referencia = $3, disco = $4, direccion = $5, perfiles = '{}', "
                      "nivel = 'caliente', dormida_desde = null, ultimo_uso = now() where tenant_id = $1",
                      tenant, ec2.nombre, casa.referencia, casa.disco, casa.direccion)
    negocio._al_dia.pop(tenant, None)
    await negocio.asegurar_maquina(tenant)  # perfiles, tokens y Hermes al día, ya en EC2
    print(f"{tenant}: fly {m['referencia']} -> ec2 {casa.referencia} ({casa.direccion})", flush=True)
    await ec2.parar(casa.referencia)


if __name__ == "__main__":
    assert config.PROVEEDOR_MAQUINAS == "ec2"
    asyncio.run(main(*sys.argv[1:4]))
