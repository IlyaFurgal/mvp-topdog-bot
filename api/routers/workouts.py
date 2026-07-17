from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from api.deps import get_current_user
from database.models import User, Workout, WorkoutCategory, WorkoutEntry, WorkoutItem
from database.session import get_session

router = APIRouter(prefix="/workouts", tags=["workouts"])


# ── Pydantic schemas ────────────────────────────────────────────────────────

class EntryIn(BaseModel):
    item_id: Optional[int] = None
    weight_kg: Optional[float] = None
    reps: Optional[int] = None
    sets: Optional[int] = None
    distance_m: Optional[int] = None
    time_sec: Optional[int] = None
    rounds: Optional[int] = None


class WorkoutCreate(BaseModel):
    date: date
    category_id: Optional[int] = None
    duration_min: Optional[int] = None
    note: Optional[str] = None
    entries: list[EntryIn] = []
    planned_time: Optional[str] = None   # "HH:MM"
    rpe: Optional[int] = None            # 1-10, feeds the calorie training addition

    @field_validator("rpe")
    @classmethod
    def _validate_rpe(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 10):
            raise ValueError("rpe must be 1-10")
        return v


class WorkoutUpdate(BaseModel):
    date: Optional[date] = None
    duration_min: Optional[int] = None
    note: Optional[str] = None
    entries: Optional[list[EntryIn]] = None
    planned_time: Optional[str] = None   # "HH:MM" — set via "перенести тренировку"
    rpe: Optional[int] = None            # 1-10

    @field_validator("rpe")
    @classmethod
    def _validate_rpe(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and not (1 <= v <= 10):
            raise ValueError("rpe must be 1-10")
        return v


class CustomItemCreate(BaseModel):
    category_id: int
    name: str


# ── Helpers ─────────────────────────────────────────────────────────────────

def _validate_planned_time(value: str) -> None:
    parts = value.split(":")
    if len(parts) != 2 or not (parts[0].isdigit() and parts[1].isdigit()):
        raise HTTPException(status_code=422, detail="planned_time must be HH:MM")


def _entry_dict(e: WorkoutEntry) -> dict:
    return {
        "id": e.id,
        "item_id": e.item_id,
        "item_name": e.item.name if e.item else None,
        "weight_kg": float(e.weight_kg) if e.weight_kg is not None else None,
        "reps": e.reps,
        "sets": e.sets,
        "distance_m": e.distance_m,
        "time_sec": e.time_sec,
        "rounds": e.rounds,
    }


def _workout_dict(w: Workout) -> dict:
    return {
        "id": w.id,
        "date": w.date.isoformat(),
        "category_id": w.category_id,
        "category_code": w.category.code if w.category else None,
        "category_name": w.category.name if w.category else None,
        "duration_min": w.duration_min,
        "note": w.note,
        "planned_time": w.planned_time,
        "rpe": w.rpe,
        "created_at": w.created_at.isoformat(),
        "entries": [_entry_dict(e) for e in (w.entries or [])],
    }


async def _get_own_workout(
    workout_id: int,
    user: User,
    session: AsyncSession,
    *,
    load_entries: bool = True,
) -> Workout:
    opts = [selectinload(Workout.category)]
    if load_entries:
        opts.append(selectinload(Workout.entries).selectinload(WorkoutEntry.item))
    result = await session.execute(
        select(Workout).where(Workout.id == workout_id).options(*opts)
    )
    w = result.scalar_one_or_none()
    if not w or w.user_id != user.id:
        raise HTTPException(status_code=404, detail="Not found")
    return w


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/categories")
async def list_categories(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(WorkoutCategory).order_by(WorkoutCategory.sort_order)
    )
    return [
        {
            "id": c.id,
            "code": c.code,
            "name": c.name,
            "metric_type": c.metric_type.value,
            "item_label": c.item_label,
        }
        for c in result.scalars().all()
    ]


@router.get("/items")
async def list_items(
    category_id: Optional[int] = Query(None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    filters = [
        WorkoutItem.is_custom.is_(False) | (WorkoutItem.user_id == user.id),
    ]
    if category_id is not None:
        filters.append(WorkoutItem.category_id == category_id)
    result = await session.execute(
        select(WorkoutItem)
        .where(and_(*filters))
        .order_by(WorkoutItem.sort_order, WorkoutItem.id)
    )
    return [
        {
            "id": i.id,
            "name": i.name,
            "is_custom": i.is_custom,
            "category_id": i.category_id,
        }
        for i in result.scalars().all()
    ]


@router.post("/items", status_code=201)
async def create_custom_item(
    body: CustomItemCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    cat = await session.get(WorkoutCategory, body.category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name required")
    item = WorkoutItem(
        category_id=body.category_id,
        name=name,
        is_custom=True,
        user_id=user.id,
    )
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return {"id": item.id, "name": item.name, "is_custom": True, "category_id": item.category_id}


@router.post("", status_code=201)
async def create_workout(
    body: WorkoutCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if body.category_id is not None:
        cat = await session.get(WorkoutCategory, body.category_id)
        if not cat:
            raise HTTPException(status_code=404, detail="Category not found")

    if body.planned_time is not None:
        _validate_planned_time(body.planned_time)

    workout = Workout(
        user_id=user.id,
        date=body.date,
        category_id=body.category_id,
        duration_min=body.duration_min,
        note=body.note,
        planned_time=body.planned_time,
        rpe=body.rpe,
    )
    session.add(workout)
    await session.flush()

    for e in body.entries:
        session.add(WorkoutEntry(
            workout_id=workout.id,
            item_id=e.item_id,
            weight_kg=e.weight_kg,
            reps=e.reps,
            sets=e.sets,
            distance_m=e.distance_m,
            time_sec=e.time_sec,
            rounds=e.rounds,
        ))

    await session.commit()

    result = await session.execute(
        select(Workout)
        .where(Workout.id == workout.id)
        .options(
            selectinload(Workout.category),
            selectinload(Workout.entries).selectinload(WorkoutEntry.item),
        )
    )
    return _workout_dict(result.scalar_one())


@router.get("")
async def list_workouts(
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    filters = [Workout.user_id == user.id]
    if from_date:
        filters.append(Workout.date >= from_date)
    if to_date:
        filters.append(Workout.date <= to_date)

    result = await session.execute(
        select(Workout)
        .where(and_(*filters))
        .options(
            selectinload(Workout.category),
            selectinload(Workout.entries).selectinload(WorkoutEntry.item),
        )
        .order_by(Workout.date.desc(), Workout.id.desc())
    )
    return [_workout_dict(w) for w in result.scalars().all()]


@router.get("/{workout_id}")
async def get_workout(
    workout_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return _workout_dict(await _get_own_workout(workout_id, user, session))


@router.put("/{workout_id}")
async def update_workout(
    workout_id: int,
    body: WorkoutUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    w = await _get_own_workout(workout_id, user, session)

    if body.date is not None:
        w.date = body.date
    if body.duration_min is not None:
        w.duration_min = body.duration_min
    if body.note is not None:
        w.note = body.note
    if body.planned_time is not None:
        _validate_planned_time(body.planned_time)
        w.planned_time = body.planned_time
    if body.rpe is not None:
        w.rpe = body.rpe

    # Marks this row as user-owned so the AI chat webhook's marker upsert
    # (same user+date+is_planned) stops overwriting it going forward.
    w.user_edited = True

    if body.entries is not None:
        # Replace all entries
        for old_entry in list(w.entries):
            await session.delete(old_entry)
        await session.flush()
        for e in body.entries:
            session.add(WorkoutEntry(
                workout_id=w.id,
                item_id=e.item_id,
                weight_kg=e.weight_kg,
                reps=e.reps,
                sets=e.sets,
                distance_m=e.distance_m,
                time_sec=e.time_sec,
                rounds=e.rounds,
            ))

    await session.commit()

    result = await session.execute(
        select(Workout)
        .where(Workout.id == w.id)
        .options(
            selectinload(Workout.category),
            selectinload(Workout.entries).selectinload(WorkoutEntry.item),
        )
    )
    return _workout_dict(result.scalar_one())


@router.delete("/{workout_id}", status_code=204)
async def delete_workout(
    workout_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    w = await _get_own_workout(workout_id, user, session, load_entries=False)
    await session.delete(w)
    await session.commit()
