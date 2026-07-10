from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.bot_sender import send_message, webapp_kb
from api.deps import _is_eligible_for_pushes, get_current_user
from database.models import Profile, Tracker, TrackerType, User
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


def calculate_calorie_limit(profile, current_weight: float | None = None) -> int:
    if not profile:
        return 2500
    weight = current_weight or profile.weight
    height = profile.height
    birth_date = profile.birth_date
    if not weight or not height or not birth_date:
        return 2500

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

    activity_coefs = {
        "sedentary": 1.2,
        "light": 1.375,
        "moderate": 1.55,
        "active": 1.725,
        "very_active": 1.9,
    }
    activity = profile.activity_level.value if profile.activity_level else "moderate"
    tdee = bmr * activity_coefs.get(activity, 1.55)

    goal = profile.goal.value if profile.goal else None
    goals = profile.goals or []
    if goal == "weight_loss" or "weight_loss" in goals:
        tdee *= 0.85
    elif goal == "muscle_gain" or "muscle_gain" in goals:
        tdee *= 1.12

    return round(tdee)


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
    limit = calculate_calorie_limit(profile)
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

    # Актуальный вес: сначала трекер сегодня, иначе последний из истории
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

    out["calorie_limit"] = calculate_calorie_limit(profile, current_weight=current_weight)
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
            "goal": calculate_calorie_limit(profile, current_weight=latest_weight_val),
        }

    return {"weight": weight_stat, "water": water_stat, "sleep": sleep_stat, "calories": cal_stat}
