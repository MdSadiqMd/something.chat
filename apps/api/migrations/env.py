import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import async_engine_from_config, AsyncConnection
from sqlalchemy.pool import NullPool

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Allow DATABASE_URL env var to override alembic.ini.
# Ensure the URL uses the asyncpg driver.
db_url = os.environ.get("DATABASE_URL")
if db_url:
    if db_url.startswith("postgresql://") or db_url.startswith("postgres://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        db_url = db_url.replace("postgres://", "postgresql+asyncpg://", 1)
    config.set_main_option("sqlalchemy.url", db_url)

target_metadata = None


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: AsyncConnection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
