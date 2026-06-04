"""
Utility for sending Telegram messages from the API process (no aiogram dispatcher needed).
Uses raw Telegram Bot API via httpx.
"""
import logging

import httpx

from core.config import settings

logger = logging.getLogger(__name__)
_TG = "https://api.telegram.org"


async def send_message(chat_id: int, text: str, reply_markup: dict | None = None) -> bool:
    payload: dict = {"chat_id": chat_id, "text": text}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{_TG}/bot{settings.BOT_TOKEN}/sendMessage",
                json=payload,
            )
            if not resp.is_success:
                logger.warning("bot_sender send_message failed %s: %s", resp.status_code, resp.text[:200])
            return resp.is_success
    except Exception as exc:
        logger.error("bot_sender send_message error: %s", exc)
        return False


async def send_video_note(chat_id: int, file_id: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{_TG}/bot{settings.BOT_TOKEN}/sendVideoNote",
                json={"chat_id": chat_id, "video_note": file_id},
            )
            if not resp.is_success:
                logger.warning("bot_sender send_video_note failed %s: %s", resp.status_code, resp.text[:200])
            return resp.is_success
    except Exception as exc:
        logger.error("bot_sender send_video_note error: %s", exc)
        return False


def webapp_kb(text: str = "ОТКРЫТЬ MVP APP →") -> dict:
    """Inline keyboard with a single WebApp button."""
    return {
        "inline_keyboard": [[
            {"text": text, "web_app": {"url": settings.mini_app_url_versioned}}
        ]]
    }


def url_kb(text: str, url: str) -> dict:
    """Inline keyboard with a single URL button."""
    return {
        "inline_keyboard": [[
            {"text": text, "url": url}
        ]]
    }
