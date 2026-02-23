from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings
from functools import lru_cache

# Load .env from backend directory so it works regardless of CWD
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    # Microsoft Graph
    azure_tenant_id: str = ""
    azure_client_id: str = ""
    azure_client_secret: str = ""
    graph_base_url: str = "https://graph.microsoft.com/v1.0"
    mailbox_email: str = ""  # Default mailbox for backfill / webhook (e.g. techbank@cachedigitech.com)

    # PostgreSQL (DATABASE_URL wins; else built from POSTGRES_*)
    database_url: str = ""
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "email_intelligence"
    postgres_user: str = "postgres"
    postgres_password: str = "postgres"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # App
    environment: str = "development"
    # Optional: only needed for Graph webhook subscriptions
    webhook_base_url: str | None = None

    # Phase 2 — OpenAI (use OPENAI_API_KEY and optionally OPENAI_MODEL)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    class Config:
        env_file = str(_ENV_FILE) if _ENV_FILE.exists() else ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

    @model_validator(mode="after")
    def build_database_url(self):
        if self.database_url and self.database_url.strip():
            return self
        url = (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )
        return self.model_copy(update={"database_url": url})


@lru_cache
def get_settings() -> Settings:
    return Settings()
