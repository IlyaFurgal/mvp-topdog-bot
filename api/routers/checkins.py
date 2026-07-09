from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, select
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from database.models import Checkin, CheckinType, Tracker, TrackerType, User
from database.session import get_session

router = APIRouter(prefix="/checkins", tags=["checkins"])

# Keys that become orphaned when plan_completed flips to 'skipped' — kept in
# sync with post_workout's STEPS in frontend/src/components/CheckinFlow.jsx
# (rpe/feeling_after are gated on plan_completed !== 'skipped' there).
_PLAN_SKIPPED_ORPHANS = {"rpe", "feeling_after", "not_completed_reason"}


class CheckinCreate(BaseModel):
    type: str
    data: dict


class CheckinPatch(BaseModel):
    data: dict


@router.post("")
async def create_checkin(
    body: CheckinCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    checkin = Checkin(
        user_id=user.id,
        type=CheckinType(body.type),
        data=body.data,
    )
    session.add(checkin)
    await session.flush()

    # Sync sleep tracker from morning checkin sleep_hours field
    if body.type == "morning" and body.data.get("sleep_hours"):
        sleep_val = float(body.data["sleep_hours"])
        today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
        existing = (await session.execute(
            select(Tracker).where(
                and_(
                    Tracker.user_id == user.id,
                    Tracker.type == TrackerType.sleep,
                    Tracker.created_at >= today_start,
                )
            ).limit(1)
        )).scalar_one_or_none()
        if existing:
            existing.value = sleep_val
        else:
            session.add(Tracker(
                user_id=user.id,
                type=TrackerType.sleep,
                value=sleep_val,
                unit="h",
                source="manual",
            ))

    await session.commit()
    await session.refresh(checkin)
    return {"id": checkin.id, "created_at": checkin.created_at}


@router.patch("/{checkin_id}")
async def patch_checkin(
    checkin_id: int,
    body: CheckinPatch,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    checkin = await session.get(Checkin, checkin_id)
    if not checkin or checkin.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")

    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    if checkin.created_at < today_start:
        raise HTTPException(status_code=403, detail="Can only edit today's checkins")

    merged = {**(checkin.data or {}), **body.data}

    # Orphan cleanup: if plan_completed flipped to 'skipped', remove dependent keys
    if body.data.get("plan_completed") == "skipped":
        for k in _PLAN_SKIPPED_ORPHANS:
            merged.pop(k, None)

    checkin.data = merged
    flag_modified(checkin, "data")

    # Sleep sync: if sleep_hours changed in a morning checkin
    if checkin.type == CheckinType.morning and "sleep_hours" in body.data:
        sleep_val = float(body.data["sleep_hours"])
        existing = (await session.execute(
            select(Tracker).where(
                and_(
                    Tracker.user_id == user.id,
                    Tracker.type == TrackerType.sleep,
                    Tracker.created_at >= today_start,
                )
            ).limit(1)
        )).scalar_one_or_none()
        if existing:
            existing.value = sleep_val
        else:
            session.add(Tracker(
                user_id=user.id,
                type=TrackerType.sleep,
                value=sleep_val,
                unit="h",
                source="manual",
            ))

    await session.commit()
    return {"id": checkin.id, "data": checkin.data}


@router.get("/today")
async def get_today_checkins(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    result = await session.execute(
        select(Checkin).where(
            and_(
                Checkin.user_id == user.id,
                Checkin.created_at >= today_start,
            )
        )
    )
    checkins = result.scalars().all()

    out: dict = {"morning": None, "evening": None, "post_workout": None}
    for c in checkins:
        out[c.type.value] = {
            "id": c.id,
            "data": c.data,
            "created_at": c.created_at.isoformat(),
        }
    return out


@router.get("/history")
async def get_checkin_history(
    limit: int = Query(default=30, le=500),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Checkin)
        .where(Checkin.user_id == user.id)
        .order_by(Checkin.created_at.desc())
        .limit(limit)
    )
    checkins = result.scalars().all()
    return [
        {
            "id": c.id,
            "type": c.type.value,
            "data": c.data,
            "created_at": c.created_at.isoformat(),
        }
        for c in checkins
    ]
