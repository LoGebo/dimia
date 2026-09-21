"""Lo que se puede instalar en un agente. Skills: carpetas en agentes/skills/
(formato agentskills.io, en español). Integraciones: las que de verdad
funcionan; las demás se muestran como «próximamente» y no se instalan."""
from pathlib import Path

import yaml

RAIZ_SKILLS = Path(__file__).resolve().parent.parent / "skills"

INTEGRACIONES = {
    "dimia": {"nombre": "Dimia", "detalle": "Citas, clientes, cobros y servicios del negocio", "lista": True},
    "gmail": {"nombre": "Gmail", "detalle": "Leer y mandar correo", "lista": True, "cuenta": "google"},
    "google-calendar": {"nombre": "Google Calendar", "detalle": "Ver y crear eventos", "lista": True, "cuenta": "google"},
    "google-drive": {"nombre": "Google Drive", "detalle": "Buscar y leer archivos", "lista": True, "cuenta": "google"},
    "whatsapp": {"nombre": "WhatsApp", "detalle": "Escribir a clientes desde la línea del negocio", "lista": True},
    "notion": {"nombre": "Notion", "detalle": "Páginas y bases de datos", "lista": True, "cuenta": "notion"},
    "github": {"nombre": "GitHub", "detalle": "Leer repositorios, escribir código, abrir issues y pull requests", "lista": True, "cuenta": "github"},
    "slack": {"nombre": "Slack", "detalle": "Leer y publicar en canales", "lista": True, "cuenta": "slack"},
    "higgsfield": {"nombre": "Higgsfield", "detalle": "Imágenes y video con IA (Sora, Veo, Kling, Nano Banana)", "lista": True, "cuenta": "higgsfield", "mcp": True},
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
