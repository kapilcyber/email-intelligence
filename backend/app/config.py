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

    # HTTP/TLS (for Graph or outbound webhooks behind corporate TLS interception)
    http_verify_ssl: bool = True
    http_ca_bundle: str = ""  # Optional path to CA bundle (pem/cert) used by HTTPX verify

    # App
    environment: str = "development"
    # Optional: only needed for Graph webhook subscriptions
    webhook_base_url: str | None = None

    # Phase 2 — Ollama (primary) + OpenAI (fallback when Ollama errors or returns bad output)
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"
    # Shorter than OpenAI: fail fast locally so fallback runs sooner (seconds per attempt).
    ollama_request_timeout_seconds: float = 22.0
    ollama_max_retries: int = 2
    ollama_retry_delay_seconds: float = 0.25
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    # When True (default), use OpenAI after Ollama exhausts retries. Set False to use only Ollama even if OPENAI_API_KEY is set.
    openai_fallback_enabled: bool = True

    # Phase 4 — Admin: comma-separated emails allowed to access admin APIs (empty = allow all authenticated)
    admin_emails: str = ""

    # Escalation detection (enterprise)
    escalation_keywords: str = ""  # Comma-separated; empty = use defaults
    escalation_re_threshold: int = 3  # Min RE: in subject to count as re_chain
    escalation_cc_senior_min: int = 2  # Min CC to senior to trigger cc_senior
    escalation_thread_threshold: int = 5  # Min messages in thread to trigger thread_length
    senior_authority_emails: str = ""  # Comma-separated emails (e.g. exec@company.com)
    senior_authority_domains: str = ""  # Comma-separated domains (e.g. executive.company.com)

    # Lead notification: when a lead is detected, POST to this URL and/or notify these emails
    sales_lead_webhook_url: str = ""  # e.g. https://hooks.slack.com/... or your endpoint
    sales_notification_emails: str = ""  # Comma-separated; webhook consumer can use this or send email
    notify_sales_on_lead: bool = True  # Set False to disable automatic sales notification

    # Daily summary: end-of-day report
    daily_summary_webhook_url: str = ""  # POST summary JSON here (e.g. Slack, email gateway)
    daily_summary_send_email_to: str = ""  # Comma-separated; optional, if SMTP configured
    daily_summary_hour_utc: int = 23  # Hour (0-23) UTC to run daily summary
    daily_summary_minute_utc: int = 0

    # Admin “External mail” filter: treat addresses in this domain as internal; others are external
    company_internal_email_domain: str = "cachedigitech.com"

    # Full-mailbox sync: skip these Graph mailFolder wellKnownName values (recoverable = litigation hold; huge)
    mailbox_sync_skip_well_known_names: str = (
        "recoverableitemsroot,recoverableitemsdeletions,recoverableitemsversions,"
        "recoverableitemspurges,recoverableitemssubstrateholds,syncissues"
    )
    # Case-insensitive substring match on displayName (comma-separated)
    mailbox_sync_skip_folder_name_contains: str = "sync issues"
    # Safety cap when enumerating folders (remaining folders are not enqueued)
    mailbox_sync_max_folders: int = 500

    # Sync Microsoft “Deleted Items” for each User.email (app-only Graph; same Mail.Read as ingest)
    outlook_deleted_sync_enabled: bool = True
    outlook_deleted_sync_days: int = 14  # per-mailbox window for each scheduled/manual sync

    # Backfill → ingest: enqueue N messages per Celery task (fewer Redis round-trips; better under many users)
    sync_ingest_chunk_size: int = 40

    # Trust / spam from known senders: evaluate senders for phishing, suspicious content
    sender_trust_enabled: bool = True  # Update sender trust_score and override spam when low trust
    sender_trust_min_score: float = 0.3  # Below this, treat as spam even if category was not Spam

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
