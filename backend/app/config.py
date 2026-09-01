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
    # Comma-separated. The machine's address changes with its DHCP lease, so a
    # single pinned origin breaks every request whenever it moves.
    frontend_origin: str = "http://localhost:3000"
    # Additionally accept any origin on a private network. A self-hosted
    # dashboard is reached by whatever address the host currently has; without
    # this, an IP change surfaces as a CORS failure that looks exactly like a
    # wrong password. Set false to pin access to frontend_origin alone.
    allow_private_network_origins: bool = True

    # Uploads
    upload_dir: str = "./data/uploads"

    @property
    def frontend_origins_list(self) -> list[str]:
        return [
            o.strip().rstrip("/")
            for o in self.frontend_origin.split(",")
            if o.strip()
        ]

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
