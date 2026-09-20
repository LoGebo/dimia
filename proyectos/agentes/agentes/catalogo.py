"""Lo que se puede instalar en un agente. Skills: carpetas en agentes/skills/
(formato agentskills.io, en español). Integraciones: las que de verdad
funcionan; las demás se muestran como «próximamente» y no se instalan."""
from pathlib import Path

import yaml

RAIZ_SKILLS = Path(__file__).resolve().parent.parent / "skills"

INTEGRACIONES = {
    "dimia": {"nombre": "Dimia", "detalle": "Citas, clientes, cobros y servicios del negocio", "lista": True},
    "gmail": {"nombre": "Gmail", "detalle": "Leer y mandar correo", "lista": False},
    "google-calendar": {"nombre": "Google Calendar", "detalle": "Ver y mover citas", "lista": False},
    "google-drive": {"nombre": "Google Drive", "detalle": "Archivos y documentos", "lista": False},
    "whatsapp": {"nombre": "WhatsApp", "detalle": "Escribir a clientes desde la línea del negocio", "lista": True},
    "notion": {"nombre": "Notion", "detalle": "Documentos y tablas", "lista": False},
    "slack": {"nombre": "Slack", "detalle": "Avisos al equipo", "lista": False},
}


def skills() -> dict[str, dict]:
    out = {}
    for d in sorted(RAIZ_SKILLS.iterdir()):
        archivo = d / "SKILL.md"
        if not archivo.is_file():
            continue
        texto = archivo.read_text()
        cabecera = yaml.safe_load(texto.split("---")[1])
        out[d.name] = {"nombre": cabecera["name"], "detalle": cabecera["description"], "contenido": texto}
    return out
