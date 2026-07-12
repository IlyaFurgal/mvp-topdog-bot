"""GetCourse API service — create/update users and sync progress fields."""
import base64
import json
import logging

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


def _gc_base() -> str:
    return f"https://{settings.GC_ACCOUNT}.getcourse.ru/pl/api"


async def _post_users(params: dict) -> dict:
    """POST to /pl/api/users with base64-encoded params."""
    if not settings.GC_API_KEY or not settings.GC_ACCOUNT:
        logger.debug("GC sync skipped — GC_API_KEY or GC_ACCOUNT not set")
        return {}
    encoded = base64.b64encode(
        json.dumps(params, ensure_ascii=False).encode("utf-8")
    ).decode("ascii")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{_gc_base()}/users",
                data={
                    "action": "add",
                    "key": settings.GC_API_KEY,
                    "params": encoded,
                },
            )
            resp.raise_for_status()
            return resp.json()
    except Exception as exc:
        logger.warning("GC API error: %s", exc)
        return {}


async def sync_user_to_gc(
    *,
    email: str,
    first_name: str,
    username: str,
    group_name: str,
    addfields: dict,
) -> dict:
    """Create or update a user in GetCourse and add them to a group.

    GC identifies users by email; an empty email with refresh_if_exists=1
    merges unrelated profiles instead of erroring (prod incident
    2026-07-11 — see _register_in_getcourse in bot/handlers/registration.py
    for the original occurrence). Refuse to send rather than risk it.
    """
    if not email:
        logger.warning("GC sync_user_to_gc SKIPPED: empty email (first_name=%r)", first_name)
        return {}
    params = {
        "user": {
            "email": email,
            "first_name": first_name,
            "addfields": {k: v for k, v in addfields.items() if k},
            "group_name": [group_name] if group_name else [],
        },
        "system": {"refresh_if_exists": 1},
    }
    return await _post_users(params)


async def sync_progress_to_gc(*, email: str, addfields: dict) -> dict:
    """Update extra (progress) fields for an existing GC user.

    Same email-required guard as sync_user_to_gc — the bot/scheduler.py
    caller already filters User.email.isnot(None)/!="" before calling this,
    but that's the caller's job, not this function's guarantee; refuse
    defensively rather than trust every future call site to remember.
    """
    if not email:
        logger.warning("GC sync_progress_to_gc SKIPPED: empty email")
        return {}
    params = {
        "user": {
            "email": email,
            "addfields": {k: v for k, v in addfields.items() if k},
        },
        "system": {"refresh_if_exists": 1},
    }
    return await _post_users(params)
