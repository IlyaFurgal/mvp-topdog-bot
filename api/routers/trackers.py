from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.bot_sender import send_message, webapp_kb
from api.deps import _is_eligible_for_pushes, get_current_user
from database.models import Checkin, CheckinType, Profile, Tracker, TrackerType, User, Workout
from database.session import get_session

router = APIRouter(prefix="/trackers", tags=["trackers"])


_VALID_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}


class TrackerCreate(BaseModel):
    type: str
    value: float
    unit: str
    meal_type: Optional[str] = None   # breakfast|lunch|dinner|snack; только для calories
    label:     Optional[str] = None   # название блюда (задел под фото→калории)
    source:    Optional[str] = "manual"  # manual|photo
    protein_g: Optional[float] = None  # калории: БЖУ за эту запись, г
    fat_g:     Optional[float] = None
    carbs_g:   Optional[float] = None

    @field_validator("meal_type")
    @classmethod
    def validate_meal_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_MEAL_TYPES:
            raise ValueError(f"meal_type must be one of {_VALID_MEAL_TYPES}")
        return v


class TrackerUpdate(BaseModel):
    value: float


class WaterTodayUpdate(BaseModel):
    value: float


class CaloriesTodayUpdate(BaseModel):
    value: float
    meal_type: Optional[str] = None

    @field_validator("meal_type")
    @classmethod
    def validate_meal_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_MEAL_TYPES:
            raise ValueError(f"meal_type must be one of {_VALID_MEAL_TYPES}")
        return v


# ── Норма калорий v2 — база (BMR × NEAT) + добавка за тренировку по RPE ──────
# Заменяет старую схему на классических коэффициентах активности (1.375-1.9,
# уже включавших тренировки "в среднем" — статичная надбавка каждый день,
# тренировался или нет, ошибка 400-700 ккал/сутки). Теперь: база не содержит
# тренировок вообще (NEAT = только бытовая активность), расход тренировки
# добавляется по факту зафиксированного чекина с RPE. См. ТЗ «новая логика
# расчёта калорий», 2026-07-10. Шаг 5 (еженедельная автокалибровка по тренду
# веса, adjustment_kcal) сознательно не реализован в этой итерации — шаги
# 1-4 самодостаточны, автокалибровка per ТЗ может ехать отдельным релизом.

NEAT_COEFFICIENTS: dict[str, float] = {
    "sedentary":    1.2,    # офис/удалёнка, большую часть дня сижу
    "moderate":     1.325,  # часть дня на ногах
    "active":       1.425,  # много хожу, подвижная работа
    "very_active":  1.525,  # физический труд, весь день в движении
}

# RPE (из чекина после тренировки, или карточки "Тренировка на сегодня") -> MET.
# ТЗ «авторасчёт расхода калорий тренировки» 2026-07-11: 1-2 и 5-6/7-8/9-10 —
# плоские ступени, 3-4 — линейная интерполяция между 3.5 и 4.0.
def _rpe_to_met(rpe: int) -> float:
    if rpe <= 2:
        return 3.0
    if rpe <= 4:
        return 3.5 + (rpe - 3) * 0.5
    if rpe <= 6:
        return 5.0
    if rpe <= 8:
        return 6.0
    return 8.0

# Чекин после тренировки не спрашивает длительность — фиксированный час на
# тренировку (ТЗ допускает дефолт 60 мин при отсутствии поля).
_DEFAULT_TRAINING_HOURS = 1.0

_TRAINING_ADDITION_CAP_PCT = 0.40  # кап добавки: не более 40% от базовой цели дня


def calculate_base_calorie_target(profile, current_weight: float | None = None) -> int:
    """BMR × NEAT, скорректировано по цели, с полом безопасности (не ниже
    BMR). Без тренировочной добавки — используй calculate_calorie_limit для
    итоговой цели дня."""
    if not profile:
        return 2500
    weight = current_weight or profile.weight
    height = profile.height
    birth_date = profile.birth_date
    if not weight or not birth_date:
        return 2500

    if not height:
        # Правило Б.6: без роста BMR не посчитать — грубая оценка вместо
        # выдумывания роста, помечается как "оценка" на стороне интерфейса.
        return round(weight * 30)

    today = date.today()
    age = today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )

    gender = profile.gender.value if profile.gender else None
    if gender == "male":
        bmr = 10 * weight + 6.25 * height - 5 * age + 5
    elif gender == "female":
        bmr = 10 * weight + 6.25 * height - 5 * age - 161
    else:
        bmr = 10 * weight + 6.25 * height - 5 * age - 78

    neat = profile.neat_level.value if profile.neat_level else "moderate"
    base = bmr * NEAT_COEFFICIENTS.get(neat, NEAT_COEFFICIENTS["moderate"])

    goal = profile.goal.value if profile.goal else None
    goals = profile.goals or []
    if goal == "weight_loss" or "weight_loss" in goals:
        target = base * 0.85   # -15%, середина диапазона -10..-20%
    elif goal == "muscle_gain" or "muscle_gain" in goals:
        target = base * 1.12   # +12%, середина диапазона +10..+15%
    else:
        target = base

    target = max(target, bmr)  # пол безопасности — никогда не ниже BMR
    return round(target)


async def _todays_training_addition(session, user_id: int, weight_kg: float, base_target: int) -> int:
    """Сумма добавок за все зафиксированные сегодня тренировки с RPE,
    конвертированные в MET × вес × длительность(ч), капнутая на 40%
    базовой цели дня. Правка тренировки задним числом закрытые дни не
    пересчитывает — считается только для сегодняшних записей на момент
    запроса. Два источника, оба суммируются:
      1) post_workout чекины (data["rpe"]) — длительность не спрашивается
         там, фиксированный час по допущению ТЗ.
      2) Workout-записи (календарь/быстрое добавление) с явным rpe —
         используют реальную duration_min, если указана (иначе тоже 1ч).
    Пользователь обычно логирует ЛИБО через чекин, ЛИБО через календарь,
    не оба сразу за одну и ту же тренировку — полноценная дедупликация
    между двумя независимыми моделями данных не производится."""
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)

    checkin_rows = (await session.execute(
        select(Checkin.data).where(
            and_(
                Checkin.user_id == user_id,
                Checkin.type == CheckinType.post_workout,
                Checkin.created_at >= today_start,
            )
        )
    )).scalars().all()

    addition = 0.0
    for data in checkin_rows:
        rpe = data.get("rpe") if isinstance(data, dict) else None
        if isinstance(rpe, (int, float)) and 1 <= rpe <= 10:
            addition += _rpe_to_met(int(rpe)) * weight_kg * _DEFAULT_TRAINING_HOURS

    workout_rows = (await session.execute(
        select(Workout.rpe, Workout.duration_min).where(
            and_(
                Workout.user_id == user_id,
                Workout.date == date.today(),
                Workout.rpe.isnot(None),
            )
        )
    )).all()
    for rpe, duration_min in workout_rows:
        if isinstance(rpe, int) and 1 <= rpe <= 10:
            hours = (duration_min / 60) if duration_min else _DEFAULT_TRAINING_HOURS
            addition += _rpe_to_met(rpe) * weight_kg * hours

    cap = base_target * _TRAINING_ADDITION_CAP_PCT
    return round(min(addition, cap))


def calculate_macro_targets(calorie_target: int, weight_kg: float | None, profile) -> dict:
    """Целевые Б/Ж/У на день, исходя из цели калорий. Белок — г/кг веса
    (2.0 при дефиците, 1.8 иначе — правило из ТЗ «новая логика расчёта
    калорий» §4), жир — 25% калорий, углеводы — остаток. См. ТЗ «правки
    раунд 3», 2026-07-10, п.9."""
    weight = weight_kg or (profile.weight if profile else None) or 70.0
    goal = profile.goal.value if profile and profile.goal else None
    goals = profile.goals or [] if profile else []
    is_deficit = goal == "weight_loss" or "weight_loss" in goals

    protein_g = round(weight * (2.0 if is_deficit else 1.8))
    fat_g = round(calorie_target * 0.25 / 9)
    carbs_kcal = calorie_target - protein_g * 4 - fat_g * 9
    carbs_g = round(max(carbs_kcal, 0) / 4)

    return {"protein_g": protein_g, "fat_g": fat_g, "carbs_g": carbs_g}


async def calculate_calorie_limit(
    session,
    user_id: int,
    profile,
    current_weight: float | None = None,
) -> int:
    """Итоговая цель калорий на сегодня: база (BMR × NEAT, скорректированная
    по цели) + добавка за зафиксированные сегодня тренировки по RPE."""
    base_target = calculate_base_calorie_target(profile, current_weight)
    if not profile:
        return base_target
    weight = current_weight or profile.weight
    if not weight:
        return base_target
    addition = await _todays_training_addition(session, user_id, weight, base_target)
    return base_target + addition


async def calculate_todays_training_burn(
    session,
    user_id: int,
    profile,
    current_weight: float | None = None,
) -> int:
    """Расход калорий за сегодняшние зафиксированные тренировки (та же
    добавка, что calculate_calorie_limit прибавляет к базовой цели) —
    для отдельного отображения "СОЖЖЕНО" на экране калорий."""
    if not profile:
        return 0
    weight = current_weight or profile.weight
    if not weight:
        return 0
    base_target = calculate_base_calorie_target(profile, current_weight)
    return await _todays_training_addition(session, user_id, weight, base_target)


def _today_start() -> datetime:
    return datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)


def _since(days: int) -> datetime:
    return datetime.combine(date.today() - timedelta(days=days), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )


async def _calories_today_sum(session, user_id: int) -> float:
    today = _today_start()
    val = await session.scalar(
        select(func.sum(Tracker.value)).where(
            and_(
                Tracker.user_id == user_id,
                Tracker.type == TrackerType.calories,
                Tracker.created_at >= today,
            )
        )
    )
    return float(val) if val is not None else 0.0


_FLOOR_AT_ZERO_TYPES = {TrackerType.water, TrackerType.calories}


async def _tracker_type_today_sum(session, user_id: int, tracker_type: TrackerType) -> float:
    today = _today_start()
    val = await session.scalar(
        select(func.sum(Tracker.value)).where(
            and_(
                Tracker.user_id == user_id,
                Tracker.type == tracker_type,
                Tracker.created_at >= today,
            )
        )
    )
    return float(val) if val is not None else 0.0


async def _maybe_push_calorie_over(session, user, profile, prev_sum: float, new_sum: float) -> None:
    """Шлёт пуш только если ИМЕННО эта запись пересекла дневной лимит."""
    if not _is_eligible_for_pushes(user):
        return
    limit = await calculate_calorie_limit(session, user.id, profile)
    if limit <= 0:
        return
    if prev_sum <= limit < new_sum:
        name = user.first_name or "друг"
        text = f"{name}, сегодня ты превысил норму по калориям. Спроси AI-ассистента, как мягко вернуться в режим."
        await send_message(chat_id=user.telegram_id, text=text, reply_markup=webapp_kb("▸ Открыть приложение"))


@router.post("")
async def create_tracker(
    body: TrackerCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    tracker_type = TrackerType(body.type)
    value = body.value

    # Water/calories are additive (each row is a delta, day total = sum) —
    # a negative delta from the "minus" quick-add buttons must not push
    # the day's running total below 0. Frontend already clamps this; this
    # is the server-side backstop for direct API calls.
    if tracker_type in _FLOOR_AT_ZERO_TYPES and value < 0:
        existing_sum = await _tracker_type_today_sum(session, user.id, tracker_type)
        if existing_sum + value < 0:
            value = -existing_sum

    tracker = Tracker(
        user_id=user.id,
        type=tracker_type,
        value=value,
        unit=body.unit,
        meal_type=body.meal_type,
        label=body.label,
        source=body.source or "manual",
        protein_g=body.protein_g,
        fat_g=body.fat_g,
        carbs_g=body.carbs_g,
    )
    session.add(tracker)
    await session.commit()
    await session.refresh(tracker)

    if tracker_type == TrackerType.calories:
        new_sum = await _calories_today_sum(session, user.id)
        prev_sum = new_sum - float(value)
        prof = await session.scalar(select(Profile).where(Profile.user_id == user.id))
        await _maybe_push_calorie_over(session, user, prof, prev_sum, new_sum)

    return {"id": tracker.id, "created_at": tracker.created_at}


@router.patch("/{tracker_id}")
async def update_tracker(
    tracker_id: int,
    body: TrackerUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Tracker).where(Tracker.id == tracker_id)
    )
    tracker = result.scalar_one_or_none()
    if not tracker:
        raise HTTPException(status_code=404, detail="Tracker not found")
    if tracker.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    tracker.value = body.value
    await session.commit()
    return {"id": tracker.id, "value": tracker.value, "unit": tracker.unit}


@router.put("/water/today")
async def set_water_today(
    body: WaterTodayUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    today = _today_start()
    await session.execute(
        delete(Tracker).where(
            and_(
                Tracker.user_id == user.id,
                Tracker.type == TrackerType.water,
                Tracker.created_at >= today,
            )
        )
    )
    new_id: int | None = None
    if body.value > 0:
        new_tracker = Tracker(
            user_id=user.id,
            type=TrackerType.water,
            value=body.value,
            unit="ml",
            source="manual_edit",
        )
        session.add(new_tracker)
        await session.flush()
        new_id = new_tracker.id
    await session.commit()
    return {"value": body.value if body.value > 0 else 0, "unit": "ml", "id": new_id}


@router.delete("/{tracker_id}")
async def delete_tracker(
    tracker_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Tracker).where(Tracker.id == tracker_id)
    )
    tracker = result.scalar_one_or_none()
    if not tracker:
        raise HTTPException(status_code=404, detail="Tracker not found")
    if tracker.user_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    await session.delete(tracker)
    await session.commit()
    return {"id": tracker_id, "deleted": True}


@router.put("/calories/today")
async def set_calories_today(
    body: CaloriesTodayUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    today = _today_start()
    await session.execute(
        delete(Tracker).where(
            and_(
                Tracker.user_id == user.id,
                Tracker.type == TrackerType.calories,
                Tracker.created_at >= today,
                or_(Tracker.source.is_(None), Tracker.source != "photo"),
            )
        )
    )
    new_id: int | None = None
    if body.value > 0:
        new_tracker = Tracker(
            user_id=user.id,
            type=TrackerType.calories,
            value=body.value,
            unit="kcal",
            meal_type=body.meal_type,
            source="manual",
        )
        session.add(new_tracker)
        await session.flush()
        new_id = new_tracker.id
    await session.commit()

    prof = await session.scalar(select(Profile).where(Profile.user_id == user.id))
    new_sum = await _calories_today_sum(session, user.id)
    await _maybe_push_calorie_over(session, user, prof, 0.0, new_sum)

    return {"value": body.value if body.value > 0 else 0, "unit": "kcal", "id": new_id}


@router.get("/today")
async def get_today_trackers(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    today = _today_start()

    profile_result = await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    result = await session.execute(
        select(Tracker)
        .where(and_(Tracker.user_id == user.id, Tracker.created_at >= today))
        .order_by(Tracker.created_at.asc())
    )
    trackers = result.scalars().all()

    out: dict = {"weight": None, "water": None, "sleep": None, "calories": None, "pulse": None}
    water_total = 0.0
    has_water = False
    last_water_id: int | None = None
    cal_total = 0.0
    manual_cal_total = 0.0
    has_calories = False
    last_cal_id: int | None = None
    cal_meals: dict[str, float] = {"breakfast": 0.0, "lunch": 0.0, "dinner": 0.0, "snack": 0.0, "uncategorized": 0.0}
    protein_total = 0.0
    fat_total = 0.0
    carbs_total = 0.0

    for t in trackers:
        if t.type == TrackerType.weight:
            out["weight"] = {"value": t.value, "unit": t.unit, "id": t.id}
        elif t.type == TrackerType.water:
            water_total += t.value
            has_water = True
            last_water_id = t.id
        elif t.type == TrackerType.sleep:
            out["sleep"] = {"value": t.value, "unit": t.unit, "id": t.id}
        elif t.type == TrackerType.pulse:
            out["pulse"] = {"value": t.value, "unit": t.unit, "id": t.id}
        elif t.type == TrackerType.calories:
            cal_total += t.value
            has_calories = True
            last_cal_id = t.id
            if t.source != "photo":
                manual_cal_total += t.value
            meal_key = t.meal_type if t.meal_type in _VALID_MEAL_TYPES else "uncategorized"
            cal_meals[meal_key] += t.value
            protein_total += t.protein_g or 0.0
            fat_total += t.fat_g or 0.0
            carbs_total += t.carbs_g or 0.0

    if has_water:
        out["water"] = {"value": water_total, "unit": "ml", "id": last_water_id}
    if has_calories:
        out["calories"] = {
            "value": cal_total,
            "unit": "kcal",
            "id": last_cal_id,
            "manual_value": round(manual_cal_total),
            "protein_g": round(protein_total, 1),
            "fat_g": round(fat_total, 1),
            "carbs_g": round(carbs_total, 1),
        }
    out["calories_meals"] = {k: round(v) for k, v in cal_meals.items()}

    # Актуальный вес: сначала трекер сегодня, иначе последний из истории —
    # вес не обнуляется на следующий день, в отличие от суточных сумм
    # (вода/калории/сон), т.к. он не "суточная" метрика, а последнее
    # известное значение (ТЗ «пул правок» 2026-07-10).
    current_weight: float | None = None
    if out["weight"]:
        current_weight = out["weight"]["value"]
    else:
        latest_w = (await session.execute(
            select(Tracker)
            .where(and_(Tracker.user_id == user.id, Tracker.type == TrackerType.weight))
            .order_by(Tracker.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()
        if latest_w:
            current_weight = latest_w.value
            out["weight"] = {"value": latest_w.value, "unit": latest_w.unit, "id": latest_w.id}

    out["calorie_limit"] = await calculate_calorie_limit(session, user.id, profile, current_weight=current_weight)
    out["macro_targets"] = calculate_macro_targets(out["calorie_limit"], current_weight, profile)
    out["calories_burned"] = await calculate_todays_training_burn(session, user.id, profile, current_weight=current_weight)
    return out


@router.get("/history")
async def get_tracker_history(
    type: str = Query(...),
    days: int = Query(default=30, le=3650),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    tracker_type = TrackerType(type)
    result = await session.execute(
        select(Tracker)
        .where(
            and_(
                Tracker.user_id == user.id,
                Tracker.type == tracker_type,
                Tracker.created_at >= _since(days),
            )
        )
        .order_by(Tracker.created_at.asc())
    )
    trackers = result.scalars().all()

    # Water / calories: group by date and sum
    if tracker_type in (TrackerType.water, TrackerType.calories):
        unit = "ml" if tracker_type == TrackerType.water else "kcal"
        by_date: dict = {}
        for t in trackers:
            d = t.created_at.date().isoformat()
            by_date[d] = by_date.get(d, 0) + t.value
        return [{"value": round(v), "unit": unit, "created_at": d} for d, v in sorted(by_date.items())]

    # Weight / sleep: latest per day
    by_date_single: dict = {}
    for t in trackers:
        d = t.created_at.date().isoformat()
        by_date_single[d] = {"value": t.value, "unit": t.unit, "created_at": d}
    return list(by_date_single.values())


@router.get("/stats")
async def get_tracker_stats(
    days: int = Query(default=30, le=3650),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    today = _today_start()
    since_period = _since(days)
    since_7 = _since(7)

    profile_result = await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    result = await session.execute(
        select(Tracker).where(
            and_(Tracker.user_id == user.id, Tracker.created_at >= since_period)
        ).order_by(Tracker.created_at.asc())
    )
    all_trackers = result.scalars().all()

    weights   = [t for t in all_trackers if t.type == TrackerType.weight]
    waters    = [t for t in all_trackers if t.type == TrackerType.water]
    sleeps    = [t for t in all_trackers if t.type == TrackerType.sleep]
    cal_list  = [t for t in all_trackers if t.type == TrackerType.calories]

    # Weight
    weight_stat = None
    if weights:
        vals = [t.value for t in weights]
        recent = [t.value for t in weights if t.created_at >= since_7]
        older = [t.value for t in weights if t.created_at < since_7]
        if recent and older:
            diff = sum(recent) / len(recent) - sum(older) / len(older)
            trend = "up" if diff > 0.2 else "down" if diff < -0.2 else "stable"
        else:
            trend = "stable"
        weight_stat = {
            "current": round(vals[-1], 1),
            "min": round(min(vals), 1),
            "max": round(max(vals), 1),
            "avg": round(sum(vals) / len(vals), 1),
            "trend": trend,
        }

    # Water
    water_stat = None
    if waters:
        by_date: dict = {}
        for t in waters:
            d = t.created_at.date()
            by_date[d] = by_date.get(d, 0) + t.value
        today_total = sum(t.value for t in waters if t.created_at >= today)
        last7 = {d: v for d, v in by_date.items() if d >= (date.today() - timedelta(days=7))}
        avg7 = sum(last7.values()) / len(last7) if last7 else 0
        water_stat = {"today": round(today_total), "avg_7days": round(avg7), "goal": 2000}

    # Sleep
    sleep_stat = None
    if sleeps:
        vals = [t.value for t in sleeps]
        last7s = [t.value for t in sleeps if t.created_at >= since_7]
        avg7 = round(sum(last7s) / len(last7s), 1) if last7s else None
        sleep_stat = {
            "last_night": round(vals[-1], 1),
            "avg_7days": avg7,
            "goal": 8,
        }

    # Calories
    cal_stat = None
    if cal_list:
        by_date_cal: dict = {}
        for t in cal_list:
            d = t.created_at.date()
            by_date_cal[d] = by_date_cal.get(d, 0) + t.value
        today_cal = sum(t.value for t in cal_list if t.created_at >= today)
        last7_cal = {d: v for d, v in by_date_cal.items() if d >= (date.today() - timedelta(days=7))}
        avg7_cal = round(sum(last7_cal.values()) / len(last7_cal)) if last7_cal else 0
        # Используем актуальный вес (последний трекер веса в выборке) для расчёта нормы
        latest_weight_val = weights[-1].value if weights else None
        cal_stat = {
            "today": round(today_cal),
            "avg_7days": avg7_cal,
            "goal": await calculate_calorie_limit(session, user.id, profile, current_weight=latest_weight_val),
        }

    return {"weight": weight_stat, "water": water_stat, "sleep": sleep_stat, "calories": cal_stat}
