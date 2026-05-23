from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status

from ..db import acquire
from ..models import (
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
    MessageCreate,
    MessageOut,
)

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    status: str | None = Query(default=None),
) -> list[ConversationOut]:
    async with acquire() as conn:
        if status:
            rows = await conn.fetch(
                """
                SELECT id, title, model_default, provider_default, status, created_at, updated_at
                FROM conversations
                WHERE status = $1
                ORDER BY updated_at DESC
                LIMIT $2 OFFSET $3
                """,
                status,
                limit,
                offset,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, title, model_default, provider_default, status, created_at, updated_at
                FROM conversations
                WHERE status = 'active'
                ORDER BY updated_at DESC
                LIMIT $1 OFFSET $2
                """,
                limit,
                offset,
            )
    return [ConversationOut(**dict(r)) for r in rows]


@router.post("", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(body: ConversationCreate) -> ConversationOut:
    async with acquire() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO conversations (title, model_default, provider_default)
            VALUES ($1, $2, $3)
            RETURNING id, title, model_default, provider_default, status, created_at, updated_at
            """,
            body.title,
            body.model_default,
            body.provider_default,
        )
    if not row:
        raise HTTPException(status_code=500, detail="Insert failed")
    return ConversationOut(**dict(row))


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: UUID) -> ConversationOut:
    async with acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, title, model_default, provider_default, status, created_at, updated_at
            FROM conversations WHERE id = $1
            """,
            conversation_id,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationOut(**dict(row))


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: UUID, body: ConversationUpdate
) -> ConversationOut:
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clauses = ", ".join(f"{col} = ${i + 2}" for i, col in enumerate(updates.keys()))
    values = list(updates.values())

    async with acquire() as conn:
        row = await conn.fetchrow(
            f"""
            UPDATE conversations
            SET {set_clauses}, updated_at = NOW()
            WHERE id = $1
            RETURNING id, title, model_default, provider_default, status, created_at, updated_at
            """,
            conversation_id,
            *values,
        )
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return ConversationOut(**dict(row))


@router.delete("/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_conversation(conversation_id: UUID) -> None:
    async with acquire() as conn:
        result = await conn.execute(
            "DELETE FROM conversations WHERE id = $1",
            conversation_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Conversation not found")


# ── Messages ──────────────────────────────────────────────────────────────────


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def list_messages(conversation_id: UUID) -> list[MessageOut]:
    async with acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, conversation_id, role, content, inference_log_id, created_at
            FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC
            """,
            conversation_id,
        )
    return [MessageOut(**dict(r)) for r in rows]


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_message(conversation_id: UUID, body: MessageCreate) -> MessageOut:
    async with acquire() as conn:
        # Ensure conversation exists
        exists = await conn.fetchval(
            "SELECT 1 FROM conversations WHERE id = $1", conversation_id
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Conversation not found")

        row = await conn.fetchrow(
            """
            INSERT INTO messages (conversation_id, role, content, inference_log_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, conversation_id, role, content, inference_log_id, created_at
            """,
            conversation_id,
            body.role,
            body.content,
            body.inference_log_id,
        )
        # Bump conversation updated_at
        await conn.execute(
            "UPDATE conversations SET updated_at = NOW() WHERE id = $1", conversation_id
        )
    if not row:
        raise HTTPException(status_code=500, detail="Insert failed")
    return MessageOut(**dict(row))


@router.delete(
    "/{conversation_id}/messages/{message_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_message(conversation_id: UUID, message_id: UUID) -> None:
    async with acquire() as conn:
        result = await conn.execute(
            "DELETE FROM messages WHERE id = $1 AND conversation_id = $2",
            message_id,
            conversation_id,
        )
    if result == "DELETE 0":
        raise HTTPException(status_code=404, detail="Message not found")
