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
SLEEP_QUALITY_DISPLAY: dict[str, str] = {
    "good":   "хороший",
    "normal": "нормальный",
    "bad":    "плохой",
}

_MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн",
                 "июл", "авг", "сен", "окт", "ноя", "дек"]


def _date_label(d) -> str:
    return f"{d.day} {_MONTHS_SHORT[d.month - 1]}"


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


async def _sum_today_or_last_day(
    session: AsyncSession,
    user_id: int,
    tracker_type: TrackerType,
    today_start: datetime,
) -> tuple[float | None, object | None]:
    """Return (total, fallback_date): today's sum if > 0, else last active day's sum."""
    today_res = await session.execute(
        select(func.sum(Tracker.value)).where(
            and_(
                Tracker.user_id == user_id,
                Tracker.type == tracker_type,
                Tracker.created_at >= today_start,
            )
        )
    )
    today_total: float | None = today_res.scalar_one_or_none()
    if today_total:
        return today_total, None

    last_date_res = await session.execute(
        select(func.max(func.date(Tracker.created_at))).where(
            and_(Tracker.user_id == user_id, Tracker.type == tracker_type)
        )
    )
    last_date = last_date_res.scalar_one_or_none()
    if not last_date:
        return None, None

    fallback_res = await session.execute(
        select(func.sum(Tracker.value)).where(
            and_(
                Tracker.user_id == user_id,
                Tracker.type == tracker_type,
                func.date(Tracker.created_at) == last_date,
            )
        )
    )
    return fallback_res.scalar_one_or_none(), last_date


async def _sleep_str(session: AsyncSession, user_id: int) -> str:
    """Sleep quality: primary from last morning checkin, fallback to trackers.sleep."""
    checkin_res = await session.execute(
        select(Checkin)
        .where(and_(Checkin.user_id == user_id, Checkin.type == CheckinType.morning))
        .order_by(Checkin.created_at.desc())
        .limit(1)
    )
    checkin = checkin_res.scalar_one_or_none()
    if checkin and checkin.data:
        sq = checkin.data.get("sleep_quality")
        label = SLEEP_QUALITY_DISPLAY.get(sq, "") if sq else ""
        if label:
            return f"сон: {label}"

    sleep_res = await session.execute(
        select(Tracker)
        .where(and_(Tracker.user_id == user_id, Tracker.type == TrackerType.sleep))
        .order_by(Tracker.created_at.desc())
        .limit(1)
    )
    rec = sleep_res.scalar_one_or_none()
    return f"{rec.value:g} ч" if rec else ""


async def _tracker_placeholders(session: AsyncSession, user_id: int) -> dict[str, str]:
    today_start = datetime.combine(
        date.today(), datetime.min.time()
    ).replace(tzinfo=timezone.utc)

    # Weight — last record (unchanged)
    weight_row = await session.execute(
        select(Tracker)
        .where(and_(Tracker.user_id == user_id, Tracker.type == TrackerType.weight))
        .order_by(Tracker.created_at.desc())
        .limit(1)
    )
    weight_rec = weight_row.scalar_one_or_none()

    # Sleep — morning checkin first, trackers.sleep fallback
    sleep_s = await _sleep_str(session, user_id)

    # Water — today or last active day with date label
    water_total, water_date = await _sum_today_or_last_day(
        session, user_id, TrackerType.water, today_start
    )
    if water_total and water_date:
        water_s = f"{_date_label(water_date)}: {water_total / 1000:.1f} л"
    elif water_total:
        water_s = f"{water_total / 1000:.1f} л"
    else:
        water_s = ""

    # Calories — today or last active day with date label
    cal_total, cal_date = await _sum_today_or_last_day(
        session, user_id, TrackerType.calories, today_start
    )
    if cal_total and cal_date:
        cal_s = f"{_date_label(cal_date)}: {int(cal_total)} ккал"
    elif cal_total:
        cal_s = f"{int(cal_total)} ккал"
    else:
        cal_s = ""

    return {
        "tracker_weight":         f"{weight_rec.value:g} кг" if weight_rec else "",
        "tracker_sleep":          sleep_s,
        "tracker_water_today":    water_s,
        "tracker_calories_today": cal_s,
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
