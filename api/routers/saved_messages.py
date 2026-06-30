from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from database.models import SavedMessage, User
from database.session import get_session

router = APIRouter(prefix="/saved-messages", tags=["saved-messages"])


class SavedMessageIn(BaseModel):
    text: str


@router.get("")
async def list_saved(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    rows = (
        await session.execute(
            select(SavedMessage)
            .where(SavedMessage.user_id == user.id)
            .order_by(SavedMessage.created_at.desc())
        )
    ).scalars().all()
    return [{"id": r.id, "text": r.text, "created_at": r.created_at.isoformat()} for r in rows]


@router.post("")
async def create_saved(
    body: SavedMessageIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    msg = SavedMessage(user_id=user.id, text=body.text.strip()[:5000])
    session.add(msg)
    await session.commit()
    await session.refresh(msg)
    return {"id": msg.id, "text": msg.text, "created_at": msg.created_at.isoformat()}


@router.delete("/{msg_id}")
async def delete_saved(
    msg_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    msg = (
        await session.execute(
            select(SavedMessage).where(
                SavedMessage.id == msg_id, SavedMessage.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404)
    await session.delete(msg)
    await session.commit()
    return {"status": "ok"}
