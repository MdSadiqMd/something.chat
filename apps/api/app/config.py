from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://chat:chat@localhost:5432/something_chat"
    redis_url: str = "redis://localhost:6379"
    redis_stream_name: str = "inference.logged"
    redis_dlq_name: str = "inference.dlq"
    redis_max_stream_len: int = 100_000


settings = Settings()
