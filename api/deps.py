from datetime import datetime, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from jwt.exceptions import InvalidTokenError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from database.crud import get_user_by_telegram_id
from database.models import User
from database.session import get_session


async def get_current_user(
    authorization: str | None = Header(None),
    session: AsyncSession = Depends(get_session),
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        telegram_id = int(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await get_user_by_telegram_id(session, telegram_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _is_subscription_active(user: User) -> bool:
    """True if user has an active, non-expired subscription."""
    if user.subscription_active != "active":
        return False
    if user.subscription_expires_at and user.subscription_expires_at < datetime.now(timezone.utc):
        return False
    return True


def _has_used_app_since_subscription(user: User) -> bool:
    """True if the user has opened the Mini App at least once since this subscription activated."""
    if not user.subscription_activated_at or not user.last_app_open_at:
        return False
    return user.last_app_open_at >= user.subscription_activated_at


def _is_eligible_for_pushes(user: User) -> bool:
    """Gate content pushes on actual Mini App usage, not just an active subscription."""
    return _is_subscription_active(user) and _has_used_app_since_subscription(user)


def require_subscription(required_type: str = "plus"):
    """
    Dependency factory.
    required_type="plus" → any active subscription (plus or pro)
    required_type="pro"  → only pro subscription
    """
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if not _is_subscription_active(user):
            raise HTTPException(status_code=403, detail="Active subscription required")
        if required_type == "pro" and user.subscription_type != "pro":
            raise HTTPException(status_code=403, detail="Pro subscription required")
        return user
    return _dep
