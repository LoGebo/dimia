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
HERMES_IMAGEN = os.environ.get("HERMES_IMAGEN", "registry.fly.io/dimia-cerebros:hermes-v11")  # imagen/ : Hermes + pantallas
# Cuatro niveles; Jev elige uno por mensaje. Ids tal como los publica el catálogo de Codex de la cuenta
# (luna «fast and affordable», terra «balanced», sol «reliable agentic workhorse», astra «most capable»).
MODELOS_CODEX = {"ligero": "gpt-5.6-luna", "rapido": "gpt-5.6-terra", "fuerte": "gpt-5.6-sol", "profundo": "gpt-6-astra"}
MODELOS_CLAUDE = {"ligero": "claude-haiku-4-5", "rapido": "claude-haiku-4-5", "fuerte": "claude-sonnet-4-6", "profundo": "claude-sonnet-4-6"}
NIVELES = ("ligero", "rapido", "fuerte", "profundo")
MODELO_CODEX = MODELOS_CODEX["fuerte"]  # el que corre si nadie decide
TYPESAFE_API_KEY = os.environ.get("TYPESAFE_API_KEY", "")  # Jev, la puerta; la única llave de plataforma en el camino caliente
MODELO_CLAUDE = MODELOS_CLAUDE["fuerte"]
MODELO_TEXTO_CHICO = os.environ.get("MODELO_TEXTO_CHICO", "google/gemini-2.5-flash-lite")  # escribe texto en formularios para navegar_rapido
VERCEL_AI_GATEWAY_KEY = os.environ.get("VERCEL_AI_GATEWAY_KEY", "")  # Jev por Vercel AI Gateway (mismo modelo, otra puerta)
# SOLO PRUEBA (no producto): token OAuth de Claude Code del dueño de Dimia para
# probar la plataforma sin cuenta de ChatGPT. Anthropic no permite intermediar
# estos tokens para terceros; se quita cuando entre el Codex real.
PRUEBA_ANTHROPIC_TOKEN = os.environ.get("PRUEBA_ANTHROPIC_TOKEN", "")
PRUEBA_ANTHROPIC_MODELO = os.environ.get("PRUEBA_ANTHROPIC_MODELO", "claude-sonnet-4-6")
# Integraciones externas: la app OAuth de Google a nombre de Dimia (Gmail, Calendar, Drive).
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
PUBLICO_URL = os.environ.get("PUBLICO_URL", "https://dimia-agentes.fly.dev")  # para armar las URL de pantalla
MINUTOS_SIN_USO = int(os.environ.get("MINUTOS_SIN_USO", "20"))

PROHIBIDAS = ("OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY")


def guardia() -> None:
    """Principio rector: ninguna llave frontier de plataforma en este proceso."""
    presentes = [n for n in PROHIBIDAS if os.environ.get(n)]
    if presentes:
        raise RuntimeError(f"Llaves frontier de plataforma presentes: {', '.join(presentes)}")
