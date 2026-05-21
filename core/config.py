from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",          # silently ignore unknown .env keys
    )

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
    GC_OFFER_CODE_PLUS: str = ""
    GC_OFFER_CODE_PRO: str = ""
    GC_PAYMENT_URL_PLUS: str = ""
    GC_PAYMENT_URL_PRO: str = ""
    GETCOURSE_PLUS_URL: str = ""
    GETCOURSE_PRO_URL: str = ""

    # Bot welcome video note (video_note file_id, optional)
    WELCOME_VIDEO_NOTE_FILE_ID: str = ""

    # Subscription prices (RUB)
    SUBSCRIPTION_PLUS_1M_PRICE: int = 990
    SUBSCRIPTION_PLUS_6M_PRICE: int = 4990
    SUBSCRIPTION_PRO_1M_PRICE: int = 2990
    SUBSCRIPTION_PRO_6M_PRICE: int = 14990

    # Support
    SUPPORT_TG_URL: str = "https://t.me/topdog_support"

    # Admin dashboard Basic Auth
    ADMIN_LOGIN: str = "admin"
    ADMIN_PASSWORD: str = "TopD0g#Adm1n25"


settings = Settings()
