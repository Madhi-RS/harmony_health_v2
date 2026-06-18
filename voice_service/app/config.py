from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    APP_NAME: str = "Harmony Health Voice Service"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # LiveKit
    LIVEKIT_URL: str = "ws://localhost:7880"
    LIVEKIT_API_KEY: str = "devkey"
    LIVEKIT_API_SECRET: str = "devsecret"

    # FasterWhisper
    WHISPER_MODEL_PATH: str = "receptionist-voice-poc/model/whisper/faster-whisper-small-int8"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_COMPUTE_TYPE: str = "int8"

    # Piper TTS
    PIPER_MODEL_PATH: str = "receptionist-voice-poc/voice/en_US-lessac-medium.onnx"
    PIPER_CONFIG_PATH: str = "receptionist-voice-poc/voice/en_US-lessac-medium.onnx.json"

    # Backend API (for voice sync)
    BACKEND_API_URL: str = "http://localhost:8000/api/v1"
    BACKEND_INTERNAL_API_KEY: str = "change-me-to-a-secure-api-key"

    # Audio
    MAX_AUDIO_SIZE_MB: int = 10
    RECORDINGS_DIR: str = "recordings"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001


settings = Settings()
