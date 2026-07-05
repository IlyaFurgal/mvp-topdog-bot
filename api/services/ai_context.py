"""
AI context builder — produces Suvvy placeholder dict for a user.

Placeholders returned by build_ai_context():
  Profile:
    name, username, subscription_type, age, sport_type, health_restrictions, additional_info,
    goal, fitness_level, activity_level, tone, gender, workouts_per_week,
    goal_display, fitness_level_display, activity_level_display,
    tone_display, gender_display

  Trackers (last known or today's aggregate):
    tracker_weight         — "82.5 кг"      | ""
    tracker_pulse_today    — "62 уд/мин"    | ""   (last known reading)
    tracker_sleep          — "7 ч"          | ""
    tracker_water_today    — "1.5 л"        | ""   (today's sum)
    tracker_calories_today — "1800 ккал"    | ""   (today's sum)

  Weekly progress:
    progress_week  — "дисциплина 75%, 6 тренировок за неделю" | ""

  Dialogue memory:
    dialog_summary — text of the latest ConversationSummary | ""

  Workout aggregates (last 28 days):
    workouts_month   — "за 4 недели 14 тренировок (3.5/нед): зал 8, бег 4" | ""
    strength_trends  — "жим лёжа 60→67.5 кг, присед 90→100 кг"            | ""
    cardio_trends    — "бег: 42.0 км за месяц, темп 5:30→5:10 /км"        | ""
    weight_trend     — "вес 84.0→82.5 кг (−1.5 за месяц)"                 | ""

  Body composition (latest [[HEALTH_METRICS:]] snapshot):
    health_metrics   — "БОМ: 1650 ккал, ИМТ: 23.4, мышечная масса: 58.2 кг, ..." | ""

Methodologist: add {{tracker_weight}}, {{tracker_pulse_today}}, {{tracker_sleep}},
{{tracker_water_today}}, {{tracker_calories_today}}, {{progress_week}},
{{dialog_summary}}, {{workouts_month}}, {{strength_trends}},
{{cardio_trends}}, {{weight_trend}}, {{health_metrics}} to Suvvy specialist system prompts.
"""
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import (
    Checkin, CheckinType, ConversationSummary,
    HealthMetrics, Profile, Tracker, TrackerType, User,
    Workout, WorkoutCategory, WorkoutEntry, WorkoutItem, WorkoutMetricType,
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
    fully = sum(1 for c in checkins if c.data.get("plan_completed") == "full")
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

    # Pulse — last record (same pattern as weight)
    pulse_row = await session.execute(
        select(Tracker)
        .where(and_(Tracker.user_id == user_id, Tracker.type == TrackerType.pulse))
        .order_by(Tracker.created_at.desc())
        .limit(1)
    )
    pulse_rec = pulse_row.scalar_one_or_none()

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
        "tracker_pulse_today":    f"{pulse_rec.value:g} уд/мин" if pulse_rec else "",
        "tracker_sleep":          sleep_s,
        "tracker_water_today":    water_s,
        "tracker_calories_today": cal_s,
    }


def _fmt_pace(pace_sec_per_km: float) -> str:
    m = int(pace_sec_per_km // 60)
    s = int(pace_sec_per_km % 60)
    return f"{m}:{s:02d}"


async def _workouts_month_str(session: AsyncSession, user_id: int) -> str:
    """Count of workouts + per-category breakdown over last 28 days."""
    since = date.today() - timedelta(days=28)
    rows = (await session.execute(
        select(WorkoutCategory.name, func.count(Workout.id).label("cnt"))
        .join(Workout, Workout.category_id == WorkoutCategory.id)
        .where(and_(Workout.user_id == user_id, Workout.date >= since))
        .group_by(WorkoutCategory.name)
        .order_by(func.count(Workout.id).desc())
    )).all()
    if not rows:
        return ""
    total = sum(r.cnt for r in rows)
    per_week = total / 4
    parts = [f"{r.name.lower()} {r.cnt}" for r in rows]
    return f"за 4 недели {total} тренировок ({per_week:g}/нед): {', '.join(parts)}"


async def _strength_trends_str(session: AsyncSession, user_id: int) -> str:
    """Top-3 strength exercises with first→last max weight over last 28 days."""
    since = date.today() - timedelta(days=28)
    rows = (await session.execute(
        select(
            WorkoutItem.name.label("item_name"),
            Workout.date,
            func.max(WorkoutEntry.weight_kg).label("max_w"),
        )
        .join(Workout, WorkoutEntry.workout_id == Workout.id)
        .join(WorkoutItem, WorkoutEntry.item_id == WorkoutItem.id)
        .where(and_(
            Workout.user_id == user_id,
            Workout.date >= since,
            WorkoutEntry.weight_kg.isnot(None),
        ))
        .group_by(WorkoutItem.name, Workout.date)
        .order_by(WorkoutItem.name, Workout.date)
    )).all()
    if not rows:
        return ""

    by_exercise: dict[str, list[tuple[date, float]]] = defaultdict(list)
    for r in rows:
        by_exercise[r.item_name].append((r.date, float(r.max_w)))

    trends = []
    for name, entries in by_exercise.items():
        if len(entries) >= 2:
            first_w = entries[0][1]
            last_w = entries[-1][1]
            trends.append((name, first_w, last_w, len(entries)))

    if not trends:
        return ""

    trends.sort(key=lambda x: x[3], reverse=True)
    parts = [f"{t[0]} {t[1]:g}→{t[2]:g} кг" for t in trends[:3]]
    return ", ".join(parts)


async def _cardio_trends_str(session: AsyncSession, user_id: int) -> str:
    """Total distance + pace trend per cardio category over last 28 days."""
    since = date.today() - timedelta(days=28)
    rows = (await session.execute(
        select(
            WorkoutCategory.name.label("cat_name"),
            Workout.date,
            func.sum(WorkoutEntry.distance_m).label("dist"),
            func.sum(WorkoutEntry.time_sec).label("time"),
        )
        .join(WorkoutCategory, Workout.category_id == WorkoutCategory.id)
        .join(WorkoutEntry, WorkoutEntry.workout_id == Workout.id)
        .where(and_(
            Workout.user_id == user_id,
            Workout.date >= since,
            WorkoutCategory.metric_type == WorkoutMetricType.distance_time,
            WorkoutEntry.distance_m.isnot(None),
            WorkoutEntry.distance_m > 0,
        ))
        .group_by(WorkoutCategory.name, Workout.date)
        .order_by(WorkoutCategory.name, Workout.date)
    )).all()
    if not rows:
        return ""

    by_cat: dict[str, list] = defaultdict(list)
    for r in rows:
        by_cat[r.cat_name].append((r.date, r.dist or 0, r.time or 0))

    parts = []
    for cat_name, sessions in by_cat.items():
        total_km = sum(s[1] for s in sessions) / 1000
        paces = [
            s[2] / (s[1] / 1000)
            for s in sessions
            if s[1] > 0 and s[2] > 0
        ]
        if len(paces) >= 2:
            pace_s = f", темп {_fmt_pace(paces[0])}→{_fmt_pace(paces[-1])} /км"
        elif len(paces) == 1:
            pace_s = f", темп {_fmt_pace(paces[0])} /км"
        else:
            pace_s = ""
        parts.append(f"{cat_name.lower()}: {total_km:.1f} км за месяц{pace_s}")

    return "; ".join(parts)


async def _weight_trend_str(session: AsyncSession, user_id: int) -> str:
    """First→last weight value over last 28 days with delta."""
    since = datetime.combine(
        date.today() - timedelta(days=28), datetime.min.time()
    ).replace(tzinfo=timezone.utc)

    first_res = await session.execute(
        select(Tracker)
        .where(and_(
            Tracker.user_id == user_id,
            Tracker.type == TrackerType.weight,
            Tracker.created_at >= since,
        ))
        .order_by(Tracker.created_at.asc())
        .limit(1)
    )
    first_rec = first_res.scalar_one_or_none()

    last_res = await session.execute(
        select(Tracker)
        .where(and_(
            Tracker.user_id == user_id,
            Tracker.type == TrackerType.weight,
            Tracker.created_at >= since,
        ))
        .order_by(Tracker.created_at.desc())
        .limit(1)
    )
    last_rec = last_res.scalar_one_or_none()

    if not first_rec or not last_rec or first_rec.id == last_rec.id:
        return ""

    delta = last_rec.value - first_rec.value
    sign = "−" if delta < 0 else "+"
    return f"вес {first_rec.value:g}→{last_rec.value:g} кг ({sign}{abs(delta):.1f} за месяц)"


async def _health_metrics_str(session: AsyncSession, user_id: int) -> str:
    """Format the latest HealthMetrics snapshot as a human-readable prompt string."""
    result = await session.execute(
        select(HealthMetrics)
        .where(HealthMetrics.user_id == user_id)
        .order_by(HealthMetrics.recorded_at.desc())
        .limit(1)
    )
    hm = result.scalar_one_or_none()
    if not hm:
        return ""
    parts: list[str] = []
    if hm.bmr is not None:
        parts.append(f"БОМ: {hm.bmr:g} ккал")
    if hm.bmi is not None:
        parts.append(f"ИМТ: {hm.bmi:g}")
    if hm.muscle_mass_kg is not None:
        parts.append(f"мышечная масса: {hm.muscle_mass_kg:g} кг")
    if hm.fat_mass_kg is not None:
        parts.append(f"жировая масса: {hm.fat_mass_kg:g} кг")
    if hm.visceral_fat is not None:
        parts.append(f"висцеральный жир: {hm.visceral_fat:g}")
    if hm.metabolic_age is not None:
        parts.append(f"метаболический возраст: {hm.metabolic_age:g} лет")
    if hm.body_fat_pct is not None:
        parts.append(f"% жира: {hm.body_fat_pct:g}%")
    return ", ".join(parts)


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
        "additional_info":     profile.additional_info     or "" if profile else "",
        "goal":              _goal_raw,
        "fitness_level":     _fitness_raw,
        "activity_level":    _activity_raw,
        "tone":              _tone_raw,
        "gender":            _gender_raw,
        "workouts_per_week": (
            str(profile.workout_days_per_week)
            if profile and profile.workout_days_per_week else ""
        ),
        "goal_display":            _goals_display(_goal_raw),
        "fitness_level_display":   FITNESS_LEVEL_DISPLAY.get(_fitness_raw,  _fitness_raw),
        "activity_level_display":  ACTIVITY_LEVEL_DISPLAY.get(_activity_raw, _activity_raw),
        "tone_display":            TONE_DISPLAY.get(_tone_raw,   _tone_raw),
        "gender_display":          GENDER_DISPLAY.get(_gender_raw, _gender_raw),
    }

    placeholders.update(await _tracker_placeholders(session, user.id))
    placeholders["progress_week"]   = await _weekly_progress_str(session, user.id)
    placeholders["dialog_summary"]  = await _dialog_summary_str(session, user.id)
    placeholders["workouts_month"]  = await _workouts_month_str(session, user.id)
    placeholders["strength_trends"] = await _strength_trends_str(session, user.id)
    placeholders["cardio_trends"]   = await _cardio_trends_str(session, user.id)
    placeholders["weight_trend"]    = await _weight_trend_str(session, user.id)
    placeholders["health_metrics"]  = await _health_metrics_str(session, user.id)

    return placeholders
