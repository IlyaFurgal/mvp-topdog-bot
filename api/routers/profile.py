from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from database.models import FitnessLevel, Profile, UpgradeIntent, User
from database.session import get_session

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me")
async def get_my_profile(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    profile = (await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )).scalar_one_or_none()

    # goals: prefer new array field, fall back to legacy single goal
    goals = profile.goals if profile and profile.goals is not None else (
        [profile.goal.value] if profile and profile.goal else []
    )

    return {
        "telegram_id":          user.telegram_id,
        "first_name":           user.first_name,
        "username":             user.username,
        "is_active":            user.is_active,
        "preferred_name":       profile.preferred_name if profile else None,
        "tone":                 profile.tone.value if profile else "soft",
        "goal":                 profile.goal.value if profile and profile.goal else None,
        "goals":                goals,
        "fitness_level":        profile.fitness_level.value if profile and profile.fitness_level else None,
        "sport_type":           profile.sport_type if profile else None,
        "timezone":             profile.timezone if profile else None,
        "push_time":            profile.push_time if profile else None,
        # Subscription
        "subscription_type":    user.subscription_type,
        "subscription_active":  user.subscription_active,
        "subscription_period":  user.subscription_period,
        "subscription_expires_at": (
            user.subscription_expires_at.isoformat() if user.subscription_expires_at else None
        ),
    }


class ProfileUpdate(BaseModel):
    goals:         Optional[list[str]] = None
    fitness_level: Optional[str]       = None
    sport_type:    Optional[str]       = None
    push_time:     Optional[str]       = None   # "HH:MM"
    timezone:      Optional[str]       = None


@router.patch("/me")
async def update_my_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    profile = (await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )).scalar_one_or_none()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if body.goals is not None:
        profile.goals = body.goals

    if body.fitness_level is not None:
        try:
            profile.fitness_level = FitnessLevel(body.fitness_level)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid fitness_level: {body.fitness_level}")

    if body.sport_type is not None:
        profile.sport_type = body.sport_type

    if body.push_time is not None:
        # Validate "HH:MM" format
        parts = body.push_time.split(":")
        if len(parts) != 2 or not (parts[0].isdigit() and parts[1].isdigit()):
            raise HTTPException(status_code=422, detail="push_time must be HH:MM")
        profile.push_time = body.push_time

    if body.timezone is not None:
        profile.timezone = body.timezone

    await session.commit()
    return {"status": "ok"}


@router.post("/upgrade-intent")
async def track_upgrade_intent(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    record = (await session.execute(
        select(UpgradeIntent).where(UpgradeIntent.user_id == user.id)
    )).scalar_one_or_none()

    if record:
        record.clicked_at = datetime.now(timezone.utc)
        record.remind_count = 0
        record.reminded_at = None
    else:
        session.add(UpgradeIntent(user_id=user.id))

    await session.commit()
    return {"status": "ok"}
