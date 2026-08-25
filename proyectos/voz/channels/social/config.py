from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class SocialSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    verify_token: str = ""
    app_secret: str = ""
    # Sin firma, el webhook acepta cualquier cuerpo: solo se permite en local.
    permitir_sin_firma: bool = False

    # Un token por producto: la pagina de Facebook y la cuenta de Instagram
    # tienen permisos distintos aunque compartan la misma API.
    instagram_access_token: str = ""
    messenger_access_token: str = ""

    api_version: str = "v21.0"
    graph_url: str = "https://graph.facebook.com"

    anthropic_api_key: str = ""
    llm_model: str = "claude-haiku-4-5"
    llm_max_tokens: int = 1024
    llm_max_iteraciones: int = 6
    sesion_ttl_min: int = 30
    sesion_max_turnos: int = 24


@lru_cache
def social_settings() -> SocialSettings:
    return SocialSettings(_env_prefix="SOCIAL_")
