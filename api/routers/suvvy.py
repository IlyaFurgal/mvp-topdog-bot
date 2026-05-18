import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.deps import get_current_user
from api.suvvy_queue import pop
from core.config import settings
from database.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/suvvy", tags=["suvvy"])

SUVVY_URL = "https://api.suvvy.ai/api/webhook/custom/message"


class MessageIn(BaseModel):
    text: str


@router.post("/message")
async def send_message(
    body: MessageIn,
    user: User = Depends(get_current_user),
) -> dict:
    if not settings.SUVVY_API_KEY:
        raise HTTPException(status_code=503, detail="Suvvy not configured")

    payload = {
        "api_version": 1,
        "message_id": str(uuid.uuid4()),
        "chat_id": str(user.telegram_id),
        "text": body.text,
        "message_sender": "customer",
        "source": "MVP TopDog Mini App",
        "client_name": user.first_name or "",
    }

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(
                SUVVY_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.SUVVY_API_KEY}"},
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Suvvy send error: %s", e)
            raise HTTPException(status_code=502, detail="Failed to reach Suvvy")

    return {"status": "sent"}


@router.get("/messages")
async def get_messages(
    user: User = Depends(get_current_user),
) -> dict:
    messages = pop(str(user.telegram_id))
    return {"messages": messages}
