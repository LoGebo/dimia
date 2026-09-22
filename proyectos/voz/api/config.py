from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class ApiSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    pg_dsn: str = "postgresql://postgres:postgres@localhost:54322/postgres"
    pg_pool_min: int = 1
    pg_pool_max: int = 10
    pg_command_timeout: float = 10.0

    supabase_jwt_secret: str = ""
    supabase_jwt_algorithms: tuple[str, ...] = ("HS256",)
    supabase_jwt_audience: str = "authenticated"
    supabase_jwt_issuer: str | None = None

    # Tokens propios de la app (HS256). Si falta, solo entran tokens de Supabase.
    api_jwt_secret: str = ""
    api_access_min: int = 15
    api_refresh_dias: int = 30

    # El orquestador de agentes (proyectos/agentes) y el secreto con el que el panel le habla.
    agentes_url: str = ""
    agentes_secreto: str = ""

    # APNs (push de iOS). Sin llave no se manda nada; los avisos se quedan en la campanita.
    apns_llave: str = ""          # contenido del .p8
    apns_llave_id: str = ""
    apns_equipo: str = "4W65YUHMHD"
    apns_tema: str = "mx.dimia.app"

    api_titulo: str = "Panel de administracion"
    api_version: str = "1.0.0"
    cors_origenes: tuple[str, ...] = ()

    pagina_limite_default: int = 50
    pagina_limite_max: int = 200


@lru_cache
def api_settings() -> ApiSettings:
    return ApiSettings()
