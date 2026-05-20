from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from database.models import Profile, User
from database.session import get_session

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me")
async def get_my_profile(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    return {
        "telegram_id": user.telegram_id,
        "first_name": user.first_name,
        "username": user.username,
        "is_active": user.is_active,
        "preferred_name": profile.preferred_name if profile else None,
        "tone": profile.tone.value if profile else "soft",
        "goal": profile.goal.value if profile and profile.goal else None,
        "fitness_level": profile.fitness_level.value if profile and profile.fitness_level else None,
        "sport_type": profile.sport_type if profile else None,
        # Subscription
        "subscription_type": user.subscription_type,
        "subscription_active": user.subscription_active,
        "subscription_period": user.subscription_period,
        "subscription_expires_at": user.subscription_expires_at.isoformat() if user.subscription_expires_at else None,
    }
