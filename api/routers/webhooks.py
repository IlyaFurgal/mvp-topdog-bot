import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.suvvy_queue import push
from core.config import settings
from database.models import AiMessage, User
from database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

MAX_HISTORY = 20


async def _trim_history(session: AsyncSession, user_id: int) -> None:
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


@router.post("/getcourse")
async def getcourse_webhook(
    email: str = Form(...),
    offer_code: str = Form(...),
    finish_at: str = Form(default=None),
    event: str = Form(...),
    session: AsyncSession = Depends(get_session),
):
    """
    Webhook from GetCourse. Called on payment or refund.
    Finds user by email and updates their subscription.
    """
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        logger.warning("GC webhook: user not found for email=%s", email)
        return {"status": "ok", "message": "user not found"}

    if event == "payment":
        if settings.GC_OFFER_CODE_MVP and offer_code == settings.GC_OFFER_CODE_MVP:
            sub_type = "mvp"
        elif settings.GC_OFFER_CODE_AI and offer_code == settings.GC_OFFER_CODE_AI:
            sub_type = "ai"
        else:
            logger.warning("GC webhook: unknown offer_code=%s, defaulting to ai", offer_code)
            sub_type = "ai"

        expires: datetime | None = None
        if finish_at:
            try:
                expires = datetime.fromisoformat(finish_at).replace(tzinfo=timezone.utc)
            except ValueError:
                logger.warning("GC webhook: cannot parse finish_at=%s", finish_at)

        user.subscription_type = sub_type
        user.subscription_active = "active"
        user.subscription_expires_at = expires
        logger.info("GC webhook: activated %s for user %s", sub_type, user.telegram_id)

    elif event == "refund":
        user.subscription_active = "inactive"
        user.subscription_type = None
        user.subscription_expires_at = None
        logger.info("GC webhook: refund — deactivated subscription for user %s", user.telegram_id)

    else:
        logger.warning("GC webhook: unknown event=%s", event)

    await session.commit()
    return {"status": "ok"}


@router.post("/suvvy")
async def suvvy_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Receive AI replies from Suvvy.
    Stores them in the in-memory queue (for polling) and saves to DB.
    """
    try:
        data = await request.json()
    except Exception:
        return {"status": "ok"}

    event_type = data.get("event_type", "")
    if event_type == "test_request":
        return {"status": "ok"}

    chat_id = str(data.get("chat_id", ""))
    new_messages = data.get("new_messages", [])

    texts = [
        m["text"]
        for m in new_messages
        if isinstance(m, dict) and m.get("type") == "text" and m.get("text")
    ]

    if not texts or not chat_id:
        return {"status": "ok"}

    # Push to in-memory queue for polling
    push(chat_id, texts)
    logger.info("Suvvy webhook: %d message(s) queued for chat_id=%s", len(texts), chat_id)

    # Save to DB — find user by telegram_id
    result = await session.execute(
        select(User).where(User.telegram_id == int(chat_id))
    )
    user = result.scalar_one_or_none()

    if user:
        for text_body in texts:
            session.add(AiMessage(user_id=user.id, role="ai", text=text_body))
        await session.flush()
        await _trim_history(session, user.id)
        await session.commit()
    else:
        logger.warning("Suvvy webhook: user not found for chat_id=%s, messages not persisted", chat_id)

    return {"status": "ok"}
