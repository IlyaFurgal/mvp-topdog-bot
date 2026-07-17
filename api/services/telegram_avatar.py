"""
Fetches and caches a user's full-size Telegram profile photo via the Bot
API, so the МОИ ДАННЫЕ avatar doesn't have to render the small WebApp
initData thumbnail (user.photo_url) upscaled and blurry.
"""
import logging
import uuid
from pathlib import Path

import httpx

from core.config import settings

logger = logging.getLogger(__name__)
_TG = "https://api.telegram.org"

UPLOADS_DIR = Path("/app/uploads")
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


async def fetch_telegram_avatar(telegram_id: int) -> str:
    """
    Downloads the user's largest available Telegram profile photo and
    saves it under /uploads, same as user-uploaded avatars. Returns the
    local "/uploads/<uuid>.jpg" path, or "" if the user has no Telegram
    photo (or the fetch failed) — callers should still cache that "" so a
    once-off failure doesn't get retried on every profile load.
    """
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            photos_resp = await client.get(
                f"{_TG}/bot{settings.BOT_TOKEN}/getUserProfilePhotos",
                params={"user_id": telegram_id, "limit": 1},
            )
            photos_data = photos_resp.json()
            if not photos_data.get("ok") or not photos_data["result"]["photos"]:
                return ""

            # Each inner list is one photo at multiple sizes, smallest first —
            # take the largest size of the most recent photo.
            largest = photos_data["result"]["photos"][0][-1]
            file_id = largest["file_id"]

            file_resp = await client.get(
                f"{_TG}/bot{settings.BOT_TOKEN}/getFile",
                params={"file_id": file_id},
            )
            file_data = file_resp.json()
            if not file_data.get("ok"):
                return ""
            file_path = file_data["result"]["file_path"]

            download_resp = await client.get(f"{_TG}/file/bot{settings.BOT_TOKEN}/{file_path}")
            if not download_resp.is_success:
                return ""

            ext = file_path.rsplit(".", 1)[-1] if "." in file_path else "jpg"
            filename = f"{uuid.uuid4()}.{ext}"
            (UPLOADS_DIR / filename).write_bytes(download_resp.content)
            return f"/uploads/{filename}"
    except Exception as exc:
        logger.warning("fetch_telegram_avatar failed for user_id=%s: %s", telegram_id, exc)
        return ""
