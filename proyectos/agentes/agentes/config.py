"""Variables de entorno del orquestador. Sin OPENAI_API_KEY ni ANTHROPIC_API_KEY:
el modelo principal siempre es el Codex del negocio."""
import os


def obligatoria(nombre: str) -> str:
    valor = os.environ.get(nombre, "").strip()
    if not valor:
        raise RuntimeError(f"Falta la variable {nombre}")
    return valor


PG_DSN = obligatoria("PG_DSN")
# Llave de 32 bytes en base64 para cifrar tokens y llaves en reposo.
AGENTES_SECRETO = obligatoria("AGENTES_SECRETO")
# Bearer que el panel manda para hablar con este servicio.
PANEL_SECRETO = obligatoria("PANEL_SECRETO")

PROVEEDOR_MAQUINAS = os.environ.get("PROVEEDOR_MAQUINAS", "fly")
FLY_API_TOKEN = os.environ.get("FLY_API_TOKEN", "")
FLY_APP_CEREBROS = os.environ.get("FLY_APP_CEREBROS", "dimia-cerebros")
FLY_REGION = os.environ.get("FLY_REGION", "dfw")
HERMES_IMAGEN = os.environ.get("HERMES_IMAGEN", "registry.fly.io/dimia-cerebros:hermes-v1")  # imagen/ : Hermes + pantallas
MODELO_CODEX = os.environ.get("MODELO_CODEX", "gpt-5.5")
# SOLO PRUEBA (no producto): token OAuth de Claude Code del dueño de Dimia para
# probar la plataforma sin cuenta de ChatGPT. Anthropic no permite intermediar
# estos tokens para terceros; se quita cuando entre el Codex real.
PRUEBA_ANTHROPIC_TOKEN = os.environ.get("PRUEBA_ANTHROPIC_TOKEN", "")
PRUEBA_ANTHROPIC_MODELO = os.environ.get("PRUEBA_ANTHROPIC_MODELO", "claude-sonnet-4-6")
PUBLICO_URL = os.environ.get("PUBLICO_URL", "https://dimia-agentes.fly.dev")  # para armar las URL de pantalla
MINUTOS_SIN_USO = int(os.environ.get("MINUTOS_SIN_USO", "20"))

PROHIBIDAS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY")


def guardia() -> None:
    """Principio rector: ninguna llave frontier de plataforma en este proceso."""
    presentes = [n for n in PROHIBIDAS if os.environ.get(n)]
    if presentes:
        raise RuntimeError(f"Llaves frontier de plataforma presentes: {', '.join(presentes)}")
