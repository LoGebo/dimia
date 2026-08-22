from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    pg_dsn: str = "postgresql://postgres:postgres@localhost:54322/postgres"
    supabase_url: str = ""
    supabase_service_key: str = ""

    livekit_url: str = "ws://localhost:7880"
    livekit_api_key: str = "devkey"
    livekit_api_secret: str = "secret"

    deepgram_api_key: str = ""
    cartesia_api_key: str = ""
    elevenlabs_api_key: str = ""
    anthropic_api_key: str = ""

    cartesia_voice_id: str = "5c5ad5e7-1020-476b-8b91-fdcbe9cc313c"
    elevenlabs_voice_id: str = "TxGEqnHWrfWFTfGW9XjX"
    elevenlabs_model: str = "eleven_flash_v2_5"
    llm_model: str = "claude-haiku-4-5-20251001"

    n8n_webhook: str | None = None
    log_level: str = "INFO"


@lru_cache
def settings() -> Settings:
    return Settings()
