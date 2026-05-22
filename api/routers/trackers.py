from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from database.models import Tracker, TrackerType, User
from database.session import get_session

router = APIRouter(prefix="/trackers", tags=["trackers"])


class TrackerCreate(BaseModel):
    type: str
    value: float
    unit: str


def _today_start() -> datetime:
    return datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)


def _since(days: int) -> datetime:
    return datetime.combine(date.today() - timedelta(days=days), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )


@router.post("")
async def create_tracker(
    body: TrackerCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    tracker = Tracker(
        user_id=user.id,
        type=TrackerType(body.type),
        value=body.value,
        unit=body.unit,
    )
    session.add(tracker)
    await session.commit()
    await session.refresh(tracker)
    return {"id": tracker.id, "created_at": tracker.created_at}


@router.get("/today")
async def get_today_trackers(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    today = _today_start()
    result = await session.execute(
        select(Tracker)
        .where(and_(Tracker.user_id == user.id, Tracker.created_at >= today))
        .order_by(Tracker.created_at.asc())
    )
    trackers = result.scalars().all()

    out: dict = {"weight": None, "water": None, "sleep": None, "calories": None}
    water_total = 0.0
    has_water = False
    cal_total = 0.0
    has_calories = False

    for t in trackers:
        if t.type == TrackerType.weight:
            out["weight"] = {"value": t.value, "unit": t.unit}
        elif t.type == TrackerType.water:
            water_total += t.value
            has_water = True
        elif t.type == TrackerType.sleep:
            out["sleep"] = {"value": t.value, "unit": t.unit}
        elif t.type == TrackerType.calories:
            cal_total += t.value
            has_calories = True

    if has_water:
        out["water"] = {"value": water_total, "unit": "ml"}
    if has_calories:
        out["calories"] = {"value": cal_total, "unit": "kcal"}

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
        cal_stat = {"today": round(today_cal), "avg_7days": avg7_cal, "goal": 2000}

    return {"weight": weight_stat, "water": water_stat, "sleep": sleep_stat, "calories": cal_stat}
