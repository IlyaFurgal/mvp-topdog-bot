"""
AI context builder — produces Suvvy placeholder dict for a user.

Placeholders returned by build_ai_context():
  Profile:
    name, username, subscription_type, age, sport_type, health_restrictions,
    goal, fitness_level, activity_level, tone, gender,
    goal_display, fitness_level_display, activity_level_display,
    tone_display, gender_display

  Trackers (last known or today's aggregate):
    tracker_weight         — "82.5 кг"   | ""
    tracker_sleep          — "7 ч"        | ""
    tracker_water_today    — "1.5 л"      | ""   (today's sum)
    tracker_calories_today — "1800 ккал"  | ""   (today's sum)

  Weekly progress:
    progress_week  — "дисциплина 75%, 6 тренировок за неделю" | ""

  Dialogue memory (populated after ТЗ-3):
    dialog_summary — text of the latest ConversationSummary | ""

Methodologist: add {{tracker_weight}}, {{tracker_sleep}},
{{tracker_water_today}}, {{tracker_calories_today}}, {{progress_week}},
{{dialog_summary}} to Suvvy specialist system prompts as needed.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import (
    Checkin, CheckinType, ConversationSummary,
    Profile, Tracker, TrackerType, User,
)

logger = logging.getLogger(__name__)

# ── Display mappings (machine → Russian) ─────────────────────────────────────

GOAL_DISPLAY: dict[str, str] = {
    "weight_loss":    "Похудение",
    "muscle_gain":    "Набор мышечной массы",
    "maintenance":    "Поддержание формы",
    "endurance":      "Выносливость",
    "flexibility":    "Гибкость и растяжка",
    "rehabilitation": "Реабилитация",
    "stress":         "Снятие стресса",
    "sleep_quality":  "Улучшение сна",
    "competition":    "Подготовка к соревнованиям",
}
FITNESS_LEVEL_DISPLAY: dict[str, str] = {
    "beginner":     "Начинающий",
    "intermediate": "Средний уровень",
    "advanced":     "Продвинутый",
}
ACTIVITY_LEVEL_DISPLAY: dict[str, str] = {
    "sedentary":   "Сидячий образ жизни",
    "light":       "Лёгкая активность",
    "moderate":    "Средняя активность",
    "active":      "Высокая активность",
    "very_active": "Очень высокая активность",
}
TONE_DISPLAY: dict[str, str] = {
    "aggressive": "Жёсткий",
    "soft":       "Мягкий",
}
GENDER_DISPLAY: dict[str, str] = {
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


def calc_weekly_discipline(checkins: list) -> tuple[int, int]:
    """Return (discipline_pct 0–100, checkin_count) for a list of post_workout Checkins."""
    if not checkins:
        return 0, 0
    fully = sum(1 for c in checkins if c.data.get("plan_completed") == "fully")
    return round(fully / len(checkins) * 100), len(checkins)


async def _weekly_progress_str(session: AsyncSession, user_id: int) -> str:
    since = datetime.combine(
        date.today() - timedelta(days=7), datetime.min.time()
    ).replace(tzinfo=timezone.utc)
    result = await session.execute(
        select(Checkin).where(
            and_(
                Checkin.user_id == user_id,
                Checkin.created_at >= since,
                Checkin.type == CheckinType.post_workout,
            )
        )
    )
    checkins = result.scalars().all()
    if not checkins:
        return ""
    disc_pct, count = calc_weekly_discipline(checkins)
    return f"дисциплина {disc_pct}%, {count} тренировок за неделю"


async def _tracker_placeholders(session: AsyncSession, user_id: int) -> dict[str, str]:
    today_start = datetime.combine(
        date.today(), datetime.min.time()
    ).replace(tzinfo=timezone.utc)

    weight_row = await session.execute(
        select(Tracker)
        .where(and_(Tracker.user_id == user_id, Tracker.type == TrackerType.weight))
        .order_by(Tracker.created_at.desc())
        .limit(1)
    )
    weight_rec = weight_row.scalar_one_or_none()

    sleep_row = await session.execute(
        select(Tracker)
        .where(and_(Tracker.user_id == user_id, Tracker.type == TrackerType.sleep))
        .order_by(Tracker.created_at.desc())
        .limit(1)
    )
    sleep_rec = sleep_row.scalar_one_or_none()

    water_rows = await session.execute(
        select(func.sum(Tracker.value)).where(
            and_(
                Tracker.user_id == user_id,
                Tracker.type == TrackerType.water,
                Tracker.created_at >= today_start,
            )
        )
    )
    water_total: float | None = water_rows.scalar_one_or_none()

    cal_rows = await session.execute(
        select(func.sum(Tracker.value)).where(
            and_(
                Tracker.user_id == user_id,
                Tracker.type == TrackerType.calories,
                Tracker.created_at >= today_start,
            )
        )
    )
    cal_total: float | None = cal_rows.scalar_one_or_none()

    return {
        "tracker_weight":         f"{weight_rec.value:g} кг" if weight_rec else "",
        "tracker_sleep":          f"{sleep_rec.value:g} ч"   if sleep_rec  else "",
        "tracker_water_today":    f"{water_total / 1000:.1f} л" if water_total else "",
        "tracker_calories_today": f"{int(cal_total)} ккал"      if cal_total  else "",
    }


async def _dialog_summary_str(session: AsyncSession, user_id: int) -> str:
    result = await session.execute(
        select(ConversationSummary)
        .where(ConversationSummary.user_id == user_id)
        .order_by(ConversationSummary.created_at.desc())
        .limit(1)
    )
    summary = result.scalar_one_or_none()
    return summary.text if summary else ""


async def build_ai_context(session: AsyncSession, user: User) -> dict:
    """Build Suvvy placeholder dict: profile + trackers + weekly progress + dialog summary."""
    profile_result = await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    _goal_raw     = (
        ", ".join(profile.goals) if profile and profile.goals
        else (profile.goal.value if profile and profile.goal else "")
    )
    _fitness_raw  = profile.fitness_level.value  if profile and profile.fitness_level  else ""
    _activity_raw = profile.activity_level.value if profile and profile.activity_level else ""
    _tone_raw     = profile.tone.value            if profile and profile.tone           else "soft"
    _gender_raw   = profile.gender.value          if profile and profile.gender         else ""

    def _goals_display(raw: str) -> str:
        if not raw:
            return ""
        return ", ".join(GOAL_DISPLAY.get(g.strip(), g.strip()) for g in raw.split(","))

    placeholders: dict[str, str] = {
        "name":              user.first_name or "",
        "username":          user.username   or "",
        "subscription_type": user.subscription_type or "",
        "age":               _calc_age(profile.birth_date if profile else None),
        "sport_type":        profile.sport_type            or "" if profile else "",
        "health_restrictions": profile.health_restrictions or "" if profile else "",
        "goal":              _goal_raw,
        "fitness_level":     _fitness_raw,
        "activity_level":    _activity_raw,
        "tone":              _tone_raw,
        "gender":            _gender_raw,
        "goal_display":            _goals_display(_goal_raw),
        "fitness_level_display":   FITNESS_LEVEL_DISPLAY.get(_fitness_raw,  _fitness_raw),
        "activity_level_display":  ACTIVITY_LEVEL_DISPLAY.get(_activity_raw, _activity_raw),
        "tone_display":            TONE_DISPLAY.get(_tone_raw,   _tone_raw),
        "gender_display":          GENDER_DISPLAY.get(_gender_raw, _gender_raw),
    }

    placeholders.update(await _tracker_placeholders(session, user.id))
    placeholders["progress_week"]  = await _weekly_progress_str(session, user.id)
    placeholders["dialog_summary"] = await _dialog_summary_str(session, user.id)

    return placeholders
