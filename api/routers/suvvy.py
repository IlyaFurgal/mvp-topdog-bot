import json
import logging
import uuid
from datetime import date
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from api.suvvy_queue import pop
from core.config import settings
from database.models import AiMessage, Profile, User
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


def _calc_age(birth_date: date | None) -> str:
    if not birth_date:
        return ""
    today = date.today()
    age = today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )
    return str(age)


class MessageIn(BaseModel):
    text: str = ""
    image_base64: Optional[str] = None
    image_name: Optional[str] = None


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

    if not body.text and not body.image_base64:
        raise HTTPException(status_code=422, detail="text or image_base64 required")

    # Загружаем профиль для placeholders
    profile_result = await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    # Placeholders для системной инструкции Suvvy
    placeholders = {
        "name":                user.first_name or "",
        "username":            user.username or "",
        "goal":                (profile.goal.value if profile and profile.goal else ""),
        "fitness_level":       (profile.fitness_level.value if profile and profile.fitness_level else ""),
        "sport_type":          (profile.sport_type or ""),
        "activity_level":      (profile.activity_level.value if profile and profile.activity_level else ""),
        "health_restrictions": (profile.health_restrictions or ""),
        "tone":                (profile.tone.value if profile and profile.tone else "soft"),
        "subscription_type":   (user.subscription_type or ""),
        "age":                 _calc_age(profile.birth_date if profile else None),
        "gender":              (profile.gender.value if profile and profile.gender else ""),
    }

    # Attachments
    attachments = []
    if body.image_base64:
        try:
            mime = body.image_base64.split(";")[0].split(":")[1]   # image/png
            ext = mime.split("/")[1]                                 # png
            pure_b64 = body.image_base64.split(",")[1]
        except (IndexError, ValueError):
            raise HTTPException(status_code=422, detail="Invalid image_base64 format")

        attachments.append({
            "file_name": body.image_name or f"photo.{ext}",
            "file_type": "image",
            "data": pure_b64,
        })

    payload: dict = {
        "api_version":    1,
        "message_id":     str(uuid.uuid4()),
        "chat_id":        str(user.telegram_id),
        "text":           body.text,
        "message_sender": "customer",
        "source":         f"MVP TopDog | {user.username or user.telegram_id}",
        "client_name":    user.first_name or "",
        "placeholders":   placeholders,
    }
    if attachments:
        payload["attachments"] = attachments

    logger.info(
        "Suvvy payload for user %s: %s",
        user.telegram_id,
        json.dumps(payload, ensure_ascii=False, default=str),
    )

    async with httpx.AsyncClient(timeout=10) as http:
        try:
            resp = await http.post(
                SUVVY_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.SUVVY_API_KEY}"},
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Suvvy send error: %s", e)
            raise HTTPException(status_code=502, detail="Failed to reach Suvvy")

    # Сохраняем сообщение пользователя в БД
    saved_text = body.text if body.text else "📷 Фото"
    session.add(AiMessage(user_id=user.id, role="user", text=saved_text))
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
