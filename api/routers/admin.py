"""Admin dashboard — Basic Auth, no JWT required."""
import csv
import io
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from fastapi.templating import Jinja2Templates
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from database.models import (
    AiMessage, Checkin, Profile, Tracker, User,
)
from database.session import get_session

router = APIRouter(tags=["admin"])
security = HTTPBasic()

TEMPLATES_DIR = Path(__file__).parent.parent / "templates"
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# ── Display label maps ─────────────────────────────────────────────────────────

GOAL_DISPLAY = {
    "weight_loss": "Похудение",
    "muscle_gain": "Набор мышц",
    "maintenance": "Поддержание",
    "endurance":   "Выносливость",
}
FITNESS_DISPLAY = {
    "beginner":     "Новичок",
    "intermediate": "Средний",
    "advanced":     "Продвинутый",
}
ACTIVITY_DISPLAY = {
    "sedentary":   "Сидячий",
    "light":       "Лёгкая",
    "moderate":    "Умеренная",
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


# ── Helpers ────────────────────────────────────────────────────────────────────

def _label(val, mapping: dict) -> str:
    if val is None:
        return "—"
    s = val.value if hasattr(val, "value") else str(val)
    return mapping.get(s, s)


def _calc_age(birth_date: date | None) -> str:
    if not birth_date:
        return "—"
    today = date.today()
    age = today.year - birth_date.year - (
        (today.month, today.day) < (birth_date.month, birth_date.day)
    )
    return str(age)


def _to_bars(rows, label_map: dict | None = None) -> list[tuple[str, int, int]]:
    """Convert query rows [(val, count)] → [(label, count, pct_of_max)]."""
    items = []
    for row in rows:
        raw = row[0]
        if raw is None:
            s = "—"
        elif hasattr(raw, "value"):
            s = raw.value
        else:
            s = str(raw)
        label = label_map.get(s, s) if label_map else s
        items.append((label, int(row[1])))
    max_val = max((c for _, c in items), default=1)
    return [(label, cnt, int(cnt / max_val * 100)) for label, cnt in items]


# ── Auth dependency ────────────────────────────────────────────────────────────

def check_auth(credentials: HTTPBasicCredentials = Depends(security)) -> None:
    ok_user = secrets.compare_digest(
        credentials.username.encode("utf-8"),
        settings.ADMIN_LOGIN.encode("utf-8"),
    )
    ok_pass = secrets.compare_digest(
        credentials.password.encode("utf-8"),
        settings.ADMIN_PASSWORD.encode("utf-8"),
    )
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Basic"},
        )


# ── Page 1: /admin — stats ─────────────────────────────────────────────────────

@router.get("/admin", response_class=HTMLResponse)
async def admin_stats(
    request: Request,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(check_auth),
) -> HTMLResponse:
    now = datetime.now(timezone.utc)
    cut7  = now - timedelta(days=7)
    cut30 = now - timedelta(days=30)

    total = await session.scalar(select(func.count()).select_from(User)) or 0
    active_subs = await session.scalar(
        select(func.count()).select_from(User)
        .where(User.subscription_active == "active")
    ) or 0
    ai_count = await session.scalar(
        select(func.count()).select_from(User)
        .where(User.subscription_active == "active", User.subscription_type == "ai")
    ) or 0
    mvp_count = await session.scalar(
        select(func.count()).select_from(User)
        .where(User.subscription_active == "active", User.subscription_type == "mvp")
    ) or 0
    new7 = await session.scalar(
        select(func.count()).select_from(User).where(User.created_at >= cut7)
    ) or 0
    new30 = await session.scalar(
        select(func.count()).select_from(User).where(User.created_at >= cut30)
    ) or 0

    goal_rows = (await session.execute(
        select(Profile.goal, func.count().label("cnt"))
        .where(Profile.goal.isnot(None))
        .group_by(Profile.goal)
        .order_by(func.count().desc())
        .limit(5)
    )).all()

    sport_rows = (await session.execute(
        select(Profile.sport_type, func.count().label("cnt"))
        .where(Profile.sport_type.isnot(None), Profile.sport_type != "")
        .group_by(Profile.sport_type)
        .order_by(func.count().desc())
        .limit(5)
    )).all()

    health_rows = (await session.execute(
        select(Profile.health_restrictions, func.count().label("cnt"))
        .where(Profile.health_restrictions.isnot(None), Profile.health_restrictions != "")
        .group_by(Profile.health_restrictions)
        .order_by(func.count().desc())
        .limit(5)
    )).all()

    fitness_rows = (await session.execute(
        select(Profile.fitness_level, func.count().label("cnt"))
        .where(Profile.fitness_level.isnot(None))
        .group_by(Profile.fitness_level)
        .order_by(func.count().desc())
    )).all()

    gender_rows = (await session.execute(
        select(Profile.gender, func.count().label("cnt"))
        .where(Profile.gender.isnot(None))
        .group_by(Profile.gender)
        .order_by(func.count().desc())
    )).all()

    tone_rows = (await session.execute(
        select(Profile.tone, func.count().label("cnt"))
        .group_by(Profile.tone)
        .order_by(func.count().desc())
    )).all()

    return templates.TemplateResponse(
        request=request,
        name="admin/stats.html",
        context={
            "active":     "stats",
            "total":      total,
            "active_subs": active_subs,
            "ai_count":   ai_count,
            "mvp_count":  mvp_count,
            "new7":       new7,
            "new30":      new30,
            "goals":      _to_bars(goal_rows, GOAL_DISPLAY),
            "sports":     _to_bars(sport_rows),
            "healths":    _to_bars(health_rows),
            "fitness":    _to_bars(fitness_rows, FITNESS_DISPLAY),
            "genders":    _to_bars(gender_rows, GENDER_DISPLAY),
            "tones":      _to_bars(tone_rows, TONE_DISPLAY),
        },
    )


# ── CSV export — must be defined BEFORE /{telegram_id} ────────────────────────

@router.get("/admin/users/export")
async def admin_users_export(
    session: AsyncSession = Depends(get_session),
    _: None = Depends(check_auth),
) -> StreamingResponse:
    rows = (await session.execute(
        select(User, Profile)
        .outerjoin(Profile, Profile.user_id == User.id)
        .order_by(User.created_at.desc())
    )).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "ID", "Имя", "Username", "Telegram ID",
        "Тариф", "Подписка активна", "Дата окончания",
        "Цель", "Уровень подготовки", "Вид спорта",
        "Уровень активности", "Ограничения здоровья",
        "Пол", "Возраст", "Тон",
        "Дата регистрации",
    ])
    for user, profile in rows:
        writer.writerow([
            user.id,
            user.first_name or "",
            user.username or "",
            user.telegram_id,
            user.subscription_type or "",
            "Да" if user.subscription_active == "active" else "Нет",
            user.subscription_expires_at.strftime("%d.%m.%Y") if user.subscription_expires_at else "",
            _label(profile.goal if profile else None, GOAL_DISPLAY),
            _label(profile.fitness_level if profile else None, FITNESS_DISPLAY),
            profile.sport_type or "" if profile else "",
            _label(profile.activity_level if profile else None, ACTIVITY_DISPLAY),
            profile.health_restrictions or "" if profile else "",
            _label(profile.gender if profile else None, GENDER_DISPLAY),
            _calc_age(profile.birth_date if profile else None),
            _label(profile.tone if profile else None, TONE_DISPLAY),
            user.created_at.strftime("%d.%m.%Y %H:%M") if user.created_at else "",
        ])

    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8-sig")]),  # utf-8-sig for Excel compatibility
        media_type="text/csv; charset=utf-8-sig",
        headers={"Content-Disposition": "attachment; filename=topdog_users.csv"},
    )


# ── Page 2: /admin/users — table with filters ─────────────────────────────────

@router.get("/admin/users", response_class=HTMLResponse)
async def admin_users(
    request: Request,
    subscription_type: str = "",
    subscription_active: str = "",
    goal: str = "",
    session: AsyncSession = Depends(get_session),
    _: None = Depends(check_auth),
) -> HTMLResponse:
    stmt = (
        select(User, Profile)
        .outerjoin(Profile, Profile.user_id == User.id)
        .order_by(User.created_at.desc())
    )
    if subscription_type:
        stmt = stmt.where(User.subscription_type == subscription_type)
    if subscription_active == "true":
        stmt = stmt.where(User.subscription_active == "active")
    elif subscription_active == "false":
        stmt = stmt.where(User.subscription_active != "active")
    if goal:
        stmt = stmt.where(Profile.goal == goal)

    rows = (await session.execute(stmt.limit(500))).all()

    users = []
    for user, profile in rows:
        users.append({
            "id":                     user.id,
            "first_name":             user.first_name or "—",
            "username":               f"@{user.username}" if user.username else "—",
            "telegram_id":            user.telegram_id,
            "subscription_type":      user.subscription_type or "",
            "subscription_active":    user.subscription_active == "active",
            "subscription_expires_at": (
                user.subscription_expires_at.strftime("%d.%m.%Y")
                if user.subscription_expires_at else "—"
            ),
            "goal":          _label(profile.goal if profile else None, GOAL_DISPLAY),
            "fitness_level": _label(profile.fitness_level if profile else None, FITNESS_DISPLAY),
            "sport_type":    profile.sport_type or "—" if profile else "—",
            "created_at":    user.created_at.strftime("%d.%m.%Y") if user.created_at else "—",
        })

    return templates.TemplateResponse(
        request=request,
        name="admin/users.html",
        context={
            "active":           "users",
            "users":            users,
            "filter_sub_type":  subscription_type,
            "filter_sub_active": subscription_active,
            "filter_goal":      goal,
            "total":            len(users),
            "goals_list":       list(GOAL_DISPLAY.items()),
        },
    )


# ── Page 3: /admin/users/{telegram_id} — user detail ──────────────────────────

@router.get("/admin/users/{telegram_id}", response_class=HTMLResponse)
async def admin_user_detail(
    request: Request,
    telegram_id: int,
    session: AsyncSession = Depends(get_session),
    _: None = Depends(check_auth),
) -> HTMLResponse:
    user = (await session.execute(
        select(User).where(User.telegram_id == telegram_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    profile = (await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )).scalar_one_or_none()

    checkins = (await session.execute(
        select(Checkin)
        .where(Checkin.user_id == user.id)
        .order_by(Checkin.created_at.desc())
        .limit(20)
    )).scalars().all()

    trackers = (await session.execute(
        select(Tracker)
        .where(
            Tracker.user_id == user.id,
            Tracker.created_at >= datetime.now(timezone.utc) - timedelta(days=30),
        )
        .order_by(Tracker.created_at.desc())
    )).scalars().all()

    ai_messages_desc = (await session.execute(
        select(AiMessage)
        .where(AiMessage.user_id == user.id)
        .order_by(AiMessage.created_at.desc())
        .limit(20)
    )).scalars().all()

    profile_data = None
    if profile:
        profile_data = {
            "Имя для обращения":  profile.preferred_name or "—",
            "Пол":                _label(profile.gender, GENDER_DISPLAY),
            "Дата рождения":      profile.birth_date.strftime("%d.%m.%Y") if profile.birth_date else "—",
            "Возраст":            _calc_age(profile.birth_date),
            "Вес (кг)":           profile.weight or "—",
            "Рост (см)":          profile.height or "—",
            "Цель":               _label(profile.goal, GOAL_DISPLAY),
            "Вид спорта":         profile.sport_type or "—",
            "Уровень активности": _label(profile.activity_level, ACTIVITY_DISPLAY),
            "Уровень подготовки": _label(profile.fitness_level, FITNESS_DISPLAY),
            "Тренировок в неделю": profile.workout_days_per_week or "—",
            "Часов в день":       profile.workout_hours_per_day or "—",
            "Ограничения":        profile.health_restrictions or "—",
            "Тон ассистента":     _label(profile.tone, TONE_DISPLAY),
        }

    return templates.TemplateResponse(
        request=request,
        name="admin/user_detail.html",
        context={
            "active":       "users",
            "user":         user,
            "profile_data": profile_data,
            "checkins":     checkins,
            "trackers":     trackers,
            "ai_messages":  list(reversed(ai_messages_desc)),
        },
    )
