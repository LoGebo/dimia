from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class WhatsAppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    whatsapp_verify_token: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_api_version: str = "v21.0"
    whatsapp_graph_url: str = "https://graph.facebook.com"

    anthropic_api_key: str = ""
    llm_model: str = "claude-haiku-4-5"
    llm_max_tokens: int = 1024
    llm_max_iteraciones: int = 6

    sesion_ttl_min: int = 30
    sesion_max_turnos: int = 24

    @property
    def endpoint_mensajes(self) -> str:
        return (
            f"{self.whatsapp_graph_url.rstrip('/')}/{self.whatsapp_api_version}"
            f"/{self.whatsapp_phone_number_id}/messages"
        )


@lru_cache
def whatsapp_settings() -> WhatsAppSettings:
    return WhatsAppSettings()
