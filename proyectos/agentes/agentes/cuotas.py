"""Cuotas por plan. Techos provisionales (handoff §6): se fijan con la
telemetría del piloto, no antes. El corte va antes del turno, con mensaje en
español; nunca un 429 pelón."""
from agentes import db

# ponytail: techos en código; a tabla cuando alguien los quiera editar sin deploy.
TECHOS = {
    # minutos = computadora encendida (se apaga sola a los 20 min sin uso): 3,000 ≈ 100 min/día.
    # vms = máquinas de tarea a la vez; vm_usd_dia = saldo diario para ellas [est].
    "basico":  {"agentes": 2,  "turnos": 600,  "pasos": 3000,  "minutos": 3000,  "vms": 3,  "vm_usd_dia": 0.50},
    "negocio": {"agentes": 5,  "turnos": 1500, "pasos": 8000,  "minutos": 8000,  "vms": 6,  "vm_usd_dia": 2.00},
    "empresa": {"agentes": 15, "turnos": 4000, "pasos": 20000, "minutos": 20000, "vms": 15, "vm_usd_dia": 8.00},
}
NOMBRES = {"basico": "Básico", "negocio": "Negocio", "empresa": "Empresa"}


async def uso(tenant: str) -> dict:
    """Uso del mes en curso y techos del plan."""
    f = await db.uno(
        """select t.plan,
             (select count(*) from agente a where a.tenant_id = t.id and a.estado = 'activo') as agentes,
             (select count(*) from agente_turno u where u.tenant_id = t.id and u.creado >= date_trunc('month', now())) as turnos,
             (select coalesce(sum(pasos), 0) from agente_turno u where u.tenant_id = t.id and u.creado >= date_trunc('month', now())) as pasos,
             (select coalesce(sum(extract(epoch from (coalesce(fin, now()) - greatest(inicio, date_trunc('month', now())))) / 60), 0)
                from maquina_uso m where m.tenant_id = t.id and coalesce(fin, now()) >= date_trunc('month', now())) as minutos
           from tenant t where t.id = $1""", tenant)
    plan = f["plan"] if f and f["plan"] in TECHOS else "basico"
    return {"plan": plan, "nombre": NOMBRES[plan],
            "uso": {"agentes": int(f["agentes"]), "turnos": int(f["turnos"]), "pasos": int(f["pasos"]), "minutos": int(f["minutos"])},
            "techos": TECHOS[plan]}


async def verificar(tenant: str) -> str | None:
    """None si puede correr un turno; si no, el mensaje que ve el dueño."""
    u = await uso(tenant)
    t, x, n = u["techos"], u["uso"], u["nombre"]
    if x["turnos"] >= t["turnos"]:
        return f"Su plan {n} llegó a los {t['turnos']} mensajes de este mes. Sus agentes se reanudan el día 1, o puede subir de plan en Ajustes."
    if x["pasos"] >= t["pasos"]:
        return f"Su plan {n} llegó a los {t['pasos']} pasos de trabajo de este mes. Se reanuda el día 1, o puede subir de plan en Ajustes."
    if x["minutos"] >= t["minutos"]:
        return f"Su plan {n} usó sus {t['minutos']} minutos de computadora de este mes. Se reanuda el día 1, o puede subir de plan en Ajustes."
    return None


async def agentes_de_mas(tenant: str) -> str | None:
    u = await uso(tenant)
    if u["uso"]["agentes"] > u["techos"]["agentes"]:
        return f"Su plan {u['nombre']} incluye hasta {u['techos']['agentes']} agentes activos; ponga alguno en pausa o suba de plan."
    return None
