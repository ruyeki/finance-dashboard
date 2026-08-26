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

    # Plaid
    plaid_env: str = "sandbox"
    plaid_client_id: str = ""
    plaid_secret: str = ""
    plaid_products: str = "transactions,investments"
    plaid_country_codes: str = "US"
    plaid_webhook_url: str = ""

    # Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # CORS
    frontend_origin: str = "http://localhost:3000"

    # Uploads
    upload_dir: str = "./data/uploads"

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
