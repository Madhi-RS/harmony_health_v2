from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    APP_NAME: str = "Harmony Health PMS"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/harmony_health"

    # JWT — RS256 asymmetric signing
    JWT_ALGORITHM: str = "RS256"
    JWT_PRIVATE_KEY_PATH: str = "jwt_private.pem"
    JWT_PUBLIC_KEY_PATH: str = "jwt_public.pem"
    CAREPLUS_PUBLIC_KEY_PATH: str = "careplus_public.pem"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # AI Service
    AI_SERVICE_BASE_URL: str = "http://localhost:8000"
    AI_SERVICE_TENANT_ID: str = "a7e2f8b1-9c44-4d3a-b6a7-5f2e8c1d9a33"
    AI_SERVICE_SITE_ID: str = "c2b1f7d9-6a11-4e8b-9d2c-4a7e5f1c8b21"
    AI_SERVICE_TIMEOUT: int = 90

    # Voice Service (internal)
    VOICE_SYNC_API_KEY: str = "change-me-in-production"

    # LiveKit
    LIVEKIT_URL: str = "ws://localhost:7880"
    LIVEKIT_API_KEY: str = "devkey"
    LIVEKIT_API_SECRET: str = "secret"

    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
    ]

    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = True
    RATE_LIMIT_DEFAULT: str = "100/minute"


settings = Settings()
