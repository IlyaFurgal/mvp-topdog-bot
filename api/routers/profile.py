from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from database.models import FitnessLevel, Profile, Tone, UpgradeIntent, User
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
        "morning_reminder_time": profile.morning_reminder_time if profile else "08:00",
        "evening_reminder_time": profile.evening_reminder_time if profile else "21:00",
        "weight":                profile.weight if profile else None,
        "height":                profile.height if profile else None,
        "notifications_enabled": profile.notifications_enabled if profile else True,
        # Subscription
        "subscription_type":    user.subscription_type,
        "subscription_active":  user.subscription_active,
        "subscription_period":  user.subscription_period,
        "subscription_expires_at": (
            user.subscription_expires_at.isoformat() if user.subscription_expires_at else None
        ),
    }


class ProfileUpdate(BaseModel):
    preferred_name:         Optional[str]       = None
    tone:                   Optional[str]       = None   # "soft" | "aggressive"
    goals:                  Optional[list[str]] = None
    fitness_level:          Optional[str]       = None
    sport_type:             Optional[str]       = None
    push_time:              Optional[str]       = None   # "HH:MM"
    timezone:               Optional[str]       = None
    morning_reminder_time:  Optional[str]       = None   # "HH:MM"
    evening_reminder_time:  Optional[str]       = None   # "HH:MM"
    weight:                 Optional[float]     = None   # кг (стартовый/референсный)
    height:                 Optional[float]     = None   # см
    notifications_enabled:  Optional[bool]      = None


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

    if body.preferred_name is not None:
        profile.preferred_name = body.preferred_name

    if body.tone is not None:
        try:
            profile.tone = Tone(body.tone)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid tone: {body.tone}")

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

    def _validate_time(val: str, field: str) -> str:
        parts = val.split(":")
        if len(parts) != 2 or not (parts[0].isdigit() and parts[1].isdigit()):
            raise HTTPException(status_code=422, detail=f"{field} must be HH:MM")
        return val

    if body.morning_reminder_time is not None:
        profile.morning_reminder_time = _validate_time(body.morning_reminder_time, "morning_reminder_time")
        profile.push_time = profile.morning_reminder_time  # keep alias in sync

    if body.evening_reminder_time is not None:
        profile.evening_reminder_time = _validate_time(body.evening_reminder_time, "evening_reminder_time")

    if body.weight is not None:
        profile.weight = body.weight

    if body.height is not None:
        profile.height = body.height

    if body.notifications_enabled is not None:
        profile.notifications_enabled = body.notifications_enabled

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
