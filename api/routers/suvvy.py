import base64
import json
import logging
import uuid
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.deps import get_current_user
from api.services.ai_context import build_ai_context
from api.services.history import schedule_fold
from api.suvvy_queue import pop
from core.config import settings
from database.models import AiMessage, User
from database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/suvvy", tags=["suvvy"])

SUVVY_URL = "https://api.suvvy.ai/api/webhook/custom/message"
UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

PDF_MAX_PAGES   = 5
AUDIO_MAX_BYTES = 15 * 1024 * 1024  # 15 МБ


def _save_image_from_dataurl(data_url: str, name: str | None) -> tuple[str, str, str]:
    """
    Сохраняет изображение из data-URL на диск.
    Возвращает (image_path_relative, mime, pure_b64).
    """
    try:
        header, pure_b64 = data_url.split(",", 1)
        mime = header.split(";")[0].split(":")[1]   # e.g. image/png
        ext = mime.split("/")[1]                    # e.g. png
    except (IndexError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid image_base64 format")

    filename = f"{uuid.uuid4()}.{ext}"
    filepath = UPLOADS_DIR / filename
    filepath.write_bytes(base64.b64decode(pure_b64))
    return f"/uploads/{filename}", mime, pure_b64


def _save_audio_from_dataurl(data_url: str, name: str | None) -> tuple[str, str, str]:
    """
    Сохраняет аудио из data-URL на диск.
    Проверяет лимит AUDIO_MAX_BYTES.
    Возвращает (audio_path_relative, mime, pure_b64).
    """
    try:
        header, pure_b64 = data_url.split(",", 1)
        mime = header.split(";")[0].split(":")[1]          # e.g. audio/webm
        ext  = mime.split("/")[1].split(";")[0]            # e.g. webm
    except (IndexError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid audio_base64 format")

    try:
        audio_bytes = base64.b64decode(pure_b64)
    except Exception:
        raise HTTPException(status_code=422, detail="Cannot decode audio_base64")

    if len(audio_bytes) > AUDIO_MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Audio too large. Max 15 MB.",
        )

    filename = f"{uuid.uuid4()}.{ext}"
    filepath = UPLOADS_DIR / filename
    filepath.write_bytes(audio_bytes)
    return f"/uploads/{filename}", mime, pure_b64


def _save_pdf_pages(pdf_b64: str) -> list[str]:
    """
    Конвертирует PDF из base64 в PNG-изображения (макс PDF_MAX_PAGES страниц).
    Сохраняет их и возвращает список относительных путей /uploads/…
    """
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        raise HTTPException(status_code=503, detail="pdf2image not available")

    try:
        pdf_bytes = base64.b64decode(pdf_b64)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid pdf_base64")

    try:
        images = convert_from_bytes(
            pdf_bytes,
            dpi=150,
            first_page=1,
            last_page=PDF_MAX_PAGES,
            fmt="png",
        )
    except Exception as e:
        logger.error("PDF conversion error: %s", e)
        raise HTTPException(status_code=422, detail="Cannot convert PDF")

    paths = []
    for img in images:
        filename = f"{uuid.uuid4()}.png"
        filepath = UPLOADS_DIR / filename
        img.save(str(filepath), "PNG")
        paths.append(f"/uploads/{filename}")
    return paths


class MessageIn(BaseModel):
    text: str = ""
    image_base64: Optional[str] = None
    image_name: Optional[str] = None
    pdf_base64: Optional[str] = None
    pdf_name: Optional[str] = None
    audio_base64: Optional[str] = None
    audio_name: Optional[str] = None


@router.get("/history")
async def get_history(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Возвращает последние MAX_HISTORY сообщений пользователя, ASC по времени."""
    result = await session.execute(
        select(AiMessage)
        .where(AiMessage.user_id == user.id)
        .order_by(AiMessage.created_at.asc())
        .limit(MAX_HISTORY)
    )
    rows = result.scalars().all()
    return {
        "messages": [
            {"role": m.role, "text": m.text, "id": m.id, "image_path": m.image_path}
            for m in rows
        ]
    }


@router.post("/message")
async def send_message(
    body: MessageIn,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    if not settings.SUVVY_API_KEY:
        raise HTTPException(status_code=503, detail="Suvvy not configured")

    if not body.text and not body.image_base64 and not body.pdf_base64 and not body.audio_base64:
        raise HTTPException(
            status_code=422,
            detail="text, image_base64, pdf_base64 or audio_base64 required",
        )

    placeholders = await build_ai_context(session, user)

    # Attachments + saved image path
    attachments = []
    saved_image_path: str | None = None
    display_text = body.text if body.text else ""

    if body.pdf_base64:
        # Конвертируем PDF → PNG страницы
        page_paths = _save_pdf_pages(body.pdf_base64)
        saved_image_path = page_paths[0] if page_paths else None

        # Отправляем все страницы в Suvvy
        for i, path in enumerate(page_paths):
            page_filename = Path(path).name
            img_bytes = (UPLOADS_DIR / page_filename).read_bytes()
            page_b64 = base64.b64encode(img_bytes).decode()
            attachments.append({
                "file_name": f"page_{i+1}.png",
                "file_type": "image",
                "data": page_b64,
            })

        if not display_text:
            pdf_label = body.pdf_name or "document.pdf"
            display_text = f"📄 {pdf_label}"

    elif body.image_base64:
        image_path_rel, mime, pure_b64 = _save_image_from_dataurl(
            body.image_base64, body.image_name
        )
        saved_image_path = image_path_rel
        # Логируем размер полученного изображения
        try:
            img_bytes_len = len(base64.b64decode(pure_b64 + "=="))
            logger.info(
                "Image upload: user=%s name=%r size_kb=%d mime=%s",
                user.telegram_id, body.image_name, img_bytes_len // 1024, mime,
            )
        except Exception as _log_err:
            logger.warning("Could not calculate image size: %s", _log_err)
        attachments.append({
            "file_name": body.image_name or f"photo.{mime.split('/')[1]}",
            "file_type": "image",
            "data": pure_b64,
        })
        if not display_text:
            display_text = "📷 Фото"

    elif body.audio_base64:
        audio_path_rel, mime, pure_b64 = _save_audio_from_dataurl(
            body.audio_base64, body.audio_name
        )
        # _save_audio_from_dataurl уже проверил лимит 15 МБ и кинет 413 если превышено
        saved_image_path = audio_path_rel

        try:
            audio_size_bytes = len(base64.b64decode(pure_b64))
            logger.info(
                "Audio upload: user=%s name=%r size_kb=%d mime=%s",
                user.telegram_id, body.audio_name, audio_size_bytes // 1024, mime,
            )
        except Exception as _log_err:
            logger.warning("Could not calculate audio size: %s", _log_err)

        ext = mime.split("/")[1].split(";")[0]
        attachments.append({
            "file_name": body.audio_name or f"voice.{ext}",
            "file_type": "audio",
            "data":      pure_b64,
        })
        if not display_text:
            display_text = "🎤 Голосовое сообщение"

    payload: dict = {
        "api_version":    1,
        "message_id":     str(uuid.uuid4()),
        "chat_id":        str(user.telegram_id),
        "message_sender": "customer",
        "source":         f"MVP TopDog | {user.username or user.telegram_id}",
        "client_name":    user.first_name or "",
        "placeholders":   placeholders,
    }
    if body.text:
        payload["text"] = body.text
    if attachments:
        payload["attachments"] = attachments

    logger.info(
        "Suvvy payload for user %s: %s",
        user.telegram_id,
        json.dumps({k: v for k, v in payload.items() if k != "attachments"}, ensure_ascii=False, default=str),
    )

    async with httpx.AsyncClient(timeout=30) as http:
        try:
            resp = await http.post(
                SUVVY_URL,
                json=payload,
                headers={"Authorization": f"Bearer {settings.SUVVY_API_KEY}"},
            )
            logger.info(
                "Suvvy response: user=%s status=%s body=%.200s",
                user.telegram_id, resp.status_code, resp.text,
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error("Suvvy send error: user=%s error=%s", user.telegram_id, e)
            raise HTTPException(status_code=502, detail="Failed to reach Suvvy")

    # Сохраняем сообщение пользователя в БД
    session.add(AiMessage(
        user_id=user.id,
        role="user",
        text=display_text or "📎 Файл",
        image_path=saved_image_path,
    ))
    await session.commit()
    schedule_fold(user.id)

    return {"status": "sent"}


@router.get("/messages")
async def get_messages(
    user: User = Depends(get_current_user),
) -> dict:
    messages = pop(str(user.telegram_id))
    return {"messages": messages}
