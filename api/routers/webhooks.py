import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from database.models import User
from database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


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
        # Determine subscription type by offer_code
        if settings.GC_OFFER_CODE_MVP and offer_code == settings.GC_OFFER_CODE_MVP:
            sub_type = "mvp"
        elif settings.GC_OFFER_CODE_AI and offer_code == settings.GC_OFFER_CODE_AI:
            sub_type = "ai"
        else:
            # Unknown offer code — default to AI tier
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
