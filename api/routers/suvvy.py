import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from api.suvvy_queue import pop
from core.config import settings
from database.models import AiMessage, User
from database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/suvvy", tags=["suvvy"])

SUVVY_URL = "https://api.suvvy.ai/api/webhook/custom/message"
MAX_HISTORY = 20


async def _trim_history(session: AsyncSession, user_id: int) -> None:
    """Удаляет старые записи, оставляя только последние MAX_HISTORY."""
    await session.execute(
        text(
            "DELETE FROM ai_messages "
            "WHERE user_id = :user_id "
            "AND id NOT IN ("
            "  SELECT id FROM ai_messages "
            "  WHERE user_id = :user_id "
            "  ORDER BY created_at DESC "
            "  LIMIT :limit"
            ")"
        ),
        {"user_id": user_id, "limit": MAX_HISTORY},
    )


class MessageIn(BaseModel):
    text: str


@router.get("/history")
async def get_history(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Возвращает последние MAX_HISTORY сообщений пользователя, ASC по времени."""
    result = await session.execute(
        select(AiMessage)
        .where(AiMessage.user_id == user.id)
        .order_by(AiMessage.created_at.asc())
        .limit(MAX_HISTORY)
    )
    rows = result.scalars().all()
    return {
        "messages": [
            {"role": m.role, "text": m.text, "id": m.id}
            for m in rows
        ]
    }


@router.post("/message")
async def send_message(
    body: MessageIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if not settings.SUVVY_API_KEY:
        raise HTTPException(status_code=503, detail="Suvvy not configured")

    payload = {
        "api_version": 1,
        "message_id": str(uuid.uuid4()),
        "chat_id": str(user.telegram_id),
        "text": body.text,
        "message_sender": "customer",
        "source": "MVP TopDog Mini App",
        "client_name": user.first_name or "",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(
                SUVVY_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.SUVVY_API_KEY}"},
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Suvvy send error: %s", e)
            raise HTTPException(status_code=502, detail="Failed to reach Suvvy")

    # Сохраняем сообщение пользователя в БД
    session.add(AiMessage(user_id=user.id, role="user", text=body.text))
    await session.flush()
    await _trim_history(session, user.id)
    await session.commit()

    return {"status": "sent"}


@router.get("/messages")
async def get_messages(
    user: User = Depends(get_current_user),
) -> dict:
    messages = pop(str(user.telegram_id))
    return {"messages": messages}
