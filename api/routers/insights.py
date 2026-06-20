from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from api.services.ai_context import calc_weekly_discipline
from database.models import Checkin, CheckinType, User
from database.session import get_session

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/weekly")
async def get_weekly_insight(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    since = datetime.combine(
        date.today() - timedelta(days=7), datetime.min.time()
    ).replace(tzinfo=timezone.utc)

    result = await session.execute(
        select(Checkin).where(
            and_(
                Checkin.user_id == user.id,
                Checkin.created_at >= since,
                Checkin.type == CheckinType.post_workout,
            )
        )
    )
    checkins = result.scalars().all()

    if not checkins:
        return {"text": "НАЧНИ ЗАПИСЫВАТЬ ТРЕНИРОВКИ — И УВИДИШЬ ПРОГРЕСС.", "discipline_pct": None}

    discipline, _ = calc_weekly_discipline(checkins)

    if discipline > 80:
        text = "РЕЖИМ ДЕРЖИШЬ. ПРОДОЛЖАЙ."
    elif discipline >= 50:
        text = "ТЫ СТАЛ СТАБИЛЬНЕЕ, НО НЕ ДЕРЖИШЬ РЕЖИМ ПОЛНОСТЬЮ."
    else:
        text = "ЕСТЬ КУДА РАСТИ. ДОБАВЬ ДИСЦИПЛИНЫ."

    return {"text": text, "discipline_pct": discipline}
