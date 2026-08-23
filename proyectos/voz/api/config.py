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

    api_titulo: str = "Panel de administracion"
    api_version: str = "1.0.0"
    cors_origenes: tuple[str, ...] = ()

    pagina_limite_default: int = 50
    pagina_limite_max: int = 200


@lru_cache
def api_settings() -> ApiSettings:
    return ApiSettings()
