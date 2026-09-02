from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    app_password: str = "change-me"
    secret_key: str = "change-me-too"
    encryption_key: str = ""

    # Database
    database_url: str = "sqlite:///./data/finance.db"

    # Sync
    # Minutes between automatic syncs of every connected item. 0 disables.
    sync_interval_minutes: int = 360
    # Reprice investment holdings from live market data. Mutual funds (401k/Roth)
    # only need daily NAV; brokerage ETFs/stocks are repriced hourly. 0 disables.
    holdings_revalue_hours: int = 24
    brokerage_revalue_minutes: int = 60

    # Plaid
    plaid_env: str = "sandbox"
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_products: str = "transactions,investments"
    plaid_country_codes: str = "US"
    plaid_webhook_url: str = ""

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"

    # CORS
    frontend_origin: str = "http://localhost:3000"

    # Uploads
    upload_dir: str = "./data/uploads"

    # Email (optional): SMTP for period-report emails. For Gmail, use an App
    # Password (Google account -> Security -> App passwords), not your login.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""  # defaults to smtp_user
    report_email_to: str = ""

    @property
    def email_configured(self) -> bool:
        return bool(
            self.smtp_host
            and self.smtp_user
            and self.smtp_password
            and self.report_email_to
        )

    @property
    def plaid_products_list(self) -> list[str]:
        return [p.strip() for p in self.plaid_products.split(",") if p.strip()]

    @property
    def plaid_country_codes_list(self) -> list[str]:
        return [c.strip() for c in self.plaid_country_codes.split(",") if c.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
