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
    # El exec de Fly no pasa de 60 s: la subida corre sola en la máquina y aquí se espera su marca.
    # Los procesos del agente se congelan antes de empacar: con Hermes escribiendo, tar sale con 1
    # y las bases SQLite quedan a medias. La máquina se apaga después, no hay que descongelarlos.
    subir = f"pkill -STOP -u {hermes.UID}; sleep 1; tar czf /tmp/datos.tgz -C {hermes.HOME} . && ls -l /tmp/datos.tgz > /tmp/mudanza.log && curl -sf -T /tmp/datos.tgz {shlex.quote(put)}"
    c, out, err = await fly.ejecutar(m["referencia"], ["sh", "-c",
        f"rm -f /tmp/mudanza.fin; nohup sh -c {shlex.quote(subir + '; echo $? > /tmp/mudanza.fin')} >/dev/null 2>&1 &"], timeout=30)
    assert c == 0, f"no arrancó la subida: {out} {err}"
    for _ in range(180):
        await asyncio.sleep(5)
        c, out, _ = await fly.ejecutar(m["referencia"], ["sh", "-c", "cat /tmp/mudanza.fin 2>/dev/null; cat /tmp/mudanza.log 2>/dev/null"], timeout=15)
        if out.strip():
            fin, _, log = out.partition("\n")
            if fin.strip().isdigit():
                break
    assert fin.strip() == "0", f"no subió el disco: {out}"
    print("disco en S3:", log.split()[4] if log.split() else "?", "bytes", flush=True)
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
    try:
        await negocio.asegurar_maquina(tenant)  # perfiles, tokens y Hermes al día, ya en EC2
    except negocio.SinCodex:  # sin cuenta de ChatGPT no hay perfiles que escribir; el disco ya está
        print(f"{tenant}: sin cuenta de ChatGPT, la casa queda sin sincronizar", flush=True)
    print(f"{tenant}: fly {m['referencia']} -> ec2 {casa.referencia} ({casa.direccion})", flush=True)
    await ec2.parar(casa.referencia)


if __name__ == "__main__":
    assert config.PROVEEDOR_MAQUINAS == "ec2"
    asyncio.run(main(*sys.argv[1:4]))
