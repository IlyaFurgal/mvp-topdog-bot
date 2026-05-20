from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    BOT_TOKEN: str
    DATABASE_URL: str

    POSTGRES_USER: str = "user"
    POSTGRES_PASSWORD: str = "password"
    POSTGRES_DB: str = "topdog"

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    SUVVY_API_KEY: str = ""
    SUVVY_API_URL: str = "https://api.suvvy.ai"

    JWT_SECRET: str = "change-me-in-production"
    MINI_APP_URL: str = "https://topdogmvp.ru"

    # GetCourse integration
    GC_API_KEY: str = ""
    GC_ACCOUNT: str = "topdog-mvp"
    GC_OFFER_CODE_AI: str = ""
    GC_OFFER_CODE_MVP: str = ""
    GC_PAYMENT_URL_AI: str = ""
    GC_PAYMENT_URL_MVP: str = ""

    # Subscription prices (RUB)
    SUBSCRIPTION_AI_1M_PRICE: int = 990
    SUBSCRIPTION_AI_6M_PRICE: int = 4990
    SUBSCRIPTION_MVP_1M_PRICE: int = 2990
    SUBSCRIPTION_MVP_6M_PRICE: int = 14990

    # GetCourse payment links
    GETCOURSE_MVP_URL: str = ""

    # Support
    SUPPORT_TG_URL: str = "https://t.me/topdog_support"


settings = Settings()
