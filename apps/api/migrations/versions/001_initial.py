"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-05-23 00:00:00.000000
"""

from alembic import op

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")

    op.execute("""
        CREATE TABLE IF NOT EXISTS conversations (
            id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
            title            TEXT        NOT NULL DEFAULT 'New Conversation',
            model_default    TEXT        NOT NULL DEFAULT 'gpt-4o-mini',
            provider_default TEXT        NOT NULL DEFAULT 'openai',
            status           TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'archived', 'cancelled')),
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS messages (
            id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
            conversation_id  UUID        NOT NULL
                             REFERENCES conversations(id) ON DELETE CASCADE,
            role             TEXT        NOT NULL
                             CHECK (role IN ('user', 'assistant', 'system')),
            content          TEXT        NOT NULL,
            inference_log_id TEXT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS messages_conversation_id_idx
            ON messages(conversation_id, created_at)
    """)

    # TimescaleDB requires the partition column (started_at) to be part of
    # every unique index. We use no standalone PK; uniqueness is enforced via
    # the (request_id, started_at) unique index created after hypertable setup.
    op.execute("""
        CREATE TABLE IF NOT EXISTS inference_logs (
            request_id        TEXT        NOT NULL,
            conversation_id   UUID,
            message_id        UUID,
            provider          TEXT        NOT NULL,
            model             TEXT        NOT NULL,
            status            TEXT        NOT NULL
                              CHECK (status IN ('ok', 'error', 'cancelled')),
            error_code        TEXT,
            error_message     TEXT,
            started_at        TIMESTAMPTZ NOT NULL,
            finished_at       TIMESTAMPTZ,
            latency_ms        INTEGER,
            ttft_ms           INTEGER,
            prompt_tokens     INTEGER,
            completion_tokens INTEGER,
            total_tokens      INTEGER,
            cost_usd          NUMERIC(12, 6),
            input_preview     TEXT,
            output_preview    TEXT,
            redaction_summary JSONB,
            sdk_version       TEXT,
            raw_envelope      JSONB
        )
    """)

    op.execute("""
        SELECT create_hypertable(
            'inference_logs', 'started_at',
            if_not_exists => TRUE,
            chunk_time_interval => INTERVAL '1 day'
        )
    """)

    # Unique index must include started_at (partition key) — TimescaleDB rule
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS inference_logs_request_id_idx
            ON inference_logs(request_id, started_at)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS inference_logs_conv_idx
            ON inference_logs(conversation_id, started_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS inference_logs_provider_idx
            ON inference_logs(provider, started_at DESC)
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS inference_logs_status_idx
            ON inference_logs(status, started_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS inference_logs")
    op.execute("DROP TABLE IF EXISTS messages")
    op.execute("DROP TABLE IF EXISTS conversations")
