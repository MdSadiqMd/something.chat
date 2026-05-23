from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://chat:chat@localhost:5432/something_chat"
    redis_url: str = "redis://localhost:6379"
    redis_stream_name: str = "inference.logged"
    redis_dlq_name: str = "inference.dlq"
    redis_consumer_group: str = "ingest-workers"
    redis_consumer_name: str = "worker-1"
    redis_block_ms: int = 5000
    redis_batch_size: int = 10
    redis_max_retries: int = 3


settings = Settings()
