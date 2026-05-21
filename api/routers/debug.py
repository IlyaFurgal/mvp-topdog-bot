"""Debug endpoints — no auth required, for development/troubleshooting only."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import Profile, User
from database.session import get_session

router = APIRouter(prefix="/debug", tags=["debug"])

# ── Human-readable labels ──────────────────────────────────────────────────────

GOAL_DISPLAY = {
    "weight_loss": "Похудение",
    "muscle_gain": "Набор мышечной массы",
    "maintenance": "Поддержание формы",
    "endurance":   "Выносливость",
}

FITNESS_LEVEL_DISPLAY = {
    "beginner":     "Новичок",
    "intermediate": "Средний уровень",
    "advanced":     "Продвинутый",
}

ACTIVITY_LEVEL_DISPLAY = {
    "sedentary":   "Сидячий образ жизни",
    "light":       "Лёгкая активность",
    "moderate":    "Умеренно активный",
    "active":      "Активный",
    "very_active": "Очень активный",
}

TONE_DISPLAY = {
    "soft":       "Мягкий",
    "aggressive": "Жёсткий",
}

GENDER_DISPLAY = {
    "male":   "Мужской",
    "female": "Женский",
    "other":  "Другой",
}


def _calc_age(birth_date: date | None) -> str:
    if not birth_date:
        return ""
    today = date.today()
    age = today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )
    return str(age)


@router.get("/placeholders")
async def get_placeholders(
    telegram_id: int,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Returns all Suvvy placeholders for the given telegram_id, with display
    labels and possible values. No auth required — debug use only.
    """
    user_result = await session.execute(
        select(User).where(User.telegram_id == telegram_id)
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=f"User with telegram_id={telegram_id} not found")

    profile_result = await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    goal_val           = profile.goal.value           if profile and profile.goal           else ""
    fitness_level_val  = profile.fitness_level.value  if profile and profile.fitness_level  else ""
    activity_level_val = profile.activity_level.value if profile and profile.activity_level else ""
    tone_val           = profile.tone.value           if profile and profile.tone           else "soft"
    gender_val         = profile.gender.value         if profile and profile.gender         else ""
    sub_type           = user.subscription_type or ""

    placeholders = {
        "name":                     user.first_name or "",
        "username":                 user.username or "",
        "goal":                     goal_val,
        "goal_display":             GOAL_DISPLAY.get(goal_val, goal_val),
        "fitness_level":            fitness_level_val,
        "fitness_level_display":    FITNESS_LEVEL_DISPLAY.get(fitness_level_val, fitness_level_val),
        "sport_type":               profile.sport_type or "" if profile else "",
        "activity_level":           activity_level_val,
        "activity_level_display":   ACTIVITY_LEVEL_DISPLAY.get(activity_level_val, activity_level_val),
        "health_restrictions":      profile.health_restrictions or "" if profile else "",
        "tone":                     tone_val,
        "tone_display":             TONE_DISPLAY.get(tone_val, tone_val),
        "subscription_type":        sub_type,
        "subscription_type_display": sub_type.upper() if sub_type else "",
        "age":                      _calc_age(profile.birth_date if profile else None),
        "gender":                   gender_val,
        "gender_display":           GENDER_DISPLAY.get(gender_val, gender_val),
    }

    possible_values = {
        "goal":              list(GOAL_DISPLAY.keys()),
        "fitness_level":     list(FITNESS_LEVEL_DISPLAY.keys()),
        "activity_level":    list(ACTIVITY_LEVEL_DISPLAY.keys()),
        "tone":              list(TONE_DISPLAY.keys()),
        "subscription_type": ["plus", "pro"],
        "gender":            list(GENDER_DISPLAY.keys()),
    }

    return {
        "user": {
            "id":          user.id,
            "telegram_id": user.telegram_id,
            "username":    user.username,
            "first_name":  user.first_name,
        },
        "placeholders":   placeholders,
        "possible_values": possible_values,
    }
