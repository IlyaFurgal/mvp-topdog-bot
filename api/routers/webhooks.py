import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from api.bot_sender import send_message, send_video_note, webapp_kb
from api.services.getcourse import sync_user_to_gc
from api.suvvy_queue import push
from core.config import settings
from database.models import AiMessage, Profile, Tracker, TrackerType, User
from database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

MAX_HISTORY = 20

_MEAL_MARKER_RE = re.compile(r'\[\[MEAL:(\{.*?\})\]\]', re.DOTALL)
_VALID_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}


def _parse_meal_markers(text: str) -> tuple[str, list[dict]]:
    """
    Extract [[MEAL:{...}]] markers from AI response text.

    Returns:
        (cleaned_text, list_of_meal_dicts)
        cleaned_text — text with markers removed and excess blank lines trimmed.
        Each meal_dict: {"food": str, "calories": int, "meal_type": str|None}

    Errors in JSON are logged as warnings; the marker is always removed from text.
    """
    meals: list[dict] = []

    def _handle_match(m: re.Match) -> str:
        try:
            payload = json.loads(m.group(1))
            food = payload.get("food", "")
            calories = payload.get("calories")
            meal = payload.get("meal")

            if not food or not isinstance(food, str):
                raise ValueError("missing or invalid food field")
            if not isinstance(calories, (int, float)) or not (1 <= float(calories) <= 5000):
                raise ValueError(f"invalid calories: {calories!r}")

            meal_type = meal if meal in _VALID_MEAL_TYPES else None
            meals.append({
                "food": food.strip(),
                "calories": int(calories),
                "meal_type": meal_type,
            })
        except Exception as exc:
            logger.warning("Suvvy meal marker parse error: %s | raw=%r", exc, m.group(0))
        return ""  # always strip marker from visible text

    cleaned = _MEAL_MARKER_RE.sub(_handle_match, text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, meals


# ── helpers ───────────────────────────────────────────────────────────────────

def _resolve_offer(offer_code: str) -> tuple[str | None, int]:
    """
    Return (subscription_type, period_days) for a given offer code.
    Returns (None, 0) if code is unrecognised.
    """
    pro_codes: dict[str, int] = {
        settings.GC_OFFER_CODE_PRO:        30,
        settings.GC_OFFER_CODE_PRO_1M:     30,
        settings.GC_OFFER_CODE_PRO_1M_RENEW: 30,
        settings.GC_OFFER_CODE_PRO_6M:     180,
        settings.GC_OFFER_CODE_PRO_6M_RENEW: 180,
    }
    plus_codes: dict[str, int] = {
        settings.GC_OFFER_CODE_PLUS:        30,
        settings.GC_OFFER_CODE_PLUS_1M:     30,
        settings.GC_OFFER_CODE_PLUS_1M_RENEW: 30,
        settings.GC_OFFER_CODE_PLUS_6M:     180,
        settings.GC_OFFER_CODE_PLUS_6M_RENEW: 180,
    }

    if offer_code and offer_code in pro_codes:
        return "pro", pro_codes[offer_code]
    if offer_code and offer_code in plus_codes:
        return "plus", plus_codes[offer_code]
    return None, 0


async def _trim_ai_history(session: AsyncSession, user_id: int) -> None:
    await session.execute(
        text(
            "DELETE FROM ai_messages "
            "WHERE user_id = :user_id "
            "AND id NOT IN ("
            "  SELECT id FROM ai_messages "
            "  WHERE user_id = :user_id "
            "  ORDER BY created_at DESC "
            "  LIMIT :limit"
            ")"
        ),
        {"user_id": user_id, "limit": MAX_HISTORY},
    )


# ── GetCourse webhook ─────────────────────────────────────────────────────────

@router.post("/getcourse")
async def getcourse_webhook(
    email: str = Form(...),
    offer_code: str = Form(...),
    finish_at: str = Form(default=None),
    event: str = Form(...),
    session: AsyncSession = Depends(get_session),
):
    """
    Webhook from GetCourse. Called on payment or refund.
    Finds user by email and updates their subscription.
    """
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user:
        logger.warning("GC webhook: user not found for email=%s", email)
        return {"status": "ok", "message": "user not found"}

    if event == "payment":
        sub_type, period_days = _resolve_offer(offer_code)

        if sub_type is None:
            logger.warning(
                "GC webhook: unknown offer_code=%s for email=%s, defaulting to plus/30d",
                offer_code, email,
            )
            sub_type, period_days = "plus", 30

        # Determine period label for DB
        period_label = "biannual" if period_days >= 180 else "monthly"

        # Parse finish_at from GC if provided; otherwise compute from period_days
        expires: datetime | None = None
        if finish_at:
            try:
                expires = datetime.fromisoformat(finish_at).replace(tzinfo=timezone.utc)
            except ValueError:
                logger.warning("GC webhook: cannot parse finish_at=%s", finish_at)

        from datetime import timedelta
        if expires is None:
            expires = datetime.now(timezone.utc) + timedelta(days=period_days)

        user.subscription_type = sub_type
        user.subscription_active = "active"
        user.subscription_period = period_label
        user.subscription_expires_at = expires
        logger.info(
            "GC webhook: activated %s (%s) for user %s (email=%s)",
            sub_type, period_label, user.telegram_id, email,
        )
        await session.commit()

        # Send welcome message via bot
        await _send_payment_welcome(user.telegram_id, sub_type)

        # Sync to GetCourse (fire-and-forget — errors go to log only)
        await _sync_new_subscriber(user, sub_type, session)

    elif event == "refund":
        user.subscription_active = "inactive"
        user.subscription_type = None
        user.subscription_expires_at = None
        logger.info("GC webhook: refund — deactivated subscription for user %s", user.telegram_id)
        await session.commit()

        await _send_refund_notice(user.telegram_id)

    else:
        logger.warning("GC webhook: unknown event=%s", event)

    return {"status": "ok"}


async def _send_payment_welcome(telegram_id: int, sub_type: str) -> None:
    """Send welcome message to user after successful payment."""
    try:
        text_msg = (
            "Оплата прошла — добро пожаловать в клуб! 🏆\n\n"
            "Ты теперь резидент MVP by TopDog.\n\n"
            "Следующий шаг — открой приложение и познакомься с ИИ-ассистентом. "
            "Он уже знает твой профиль и готов работать."
        )
        await send_message(telegram_id, text_msg, reply_markup=webapp_kb("ОТКРЫТЬ MVP APP →"))

        if settings.WELCOME_VIDEO_NOTE_FILE_ID:
            await send_video_note(telegram_id, settings.WELCOME_VIDEO_NOTE_FILE_ID)

    except Exception as exc:
        logger.error("Failed to send payment welcome to %s: %s", telegram_id, exc)


async def _send_refund_notice(telegram_id: int) -> None:
    """Notify user their subscription was cancelled."""
    try:
        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
        kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text="ПОДДЕРЖКА →", url=settings.SUPPORT_TG_URL)
        ]])
        await send_message(
            telegram_id,
            "Подписка деактивирована. Если это ошибка — напиши в поддержку.",
            reply_markup=kb,
        )
    except Exception as exc:
        logger.error("Failed to send refund notice to %s: %s", telegram_id, exc)


async def _sync_new_subscriber(user: User, sub_type: str, session: AsyncSession) -> None:
    """Push new subscriber data to GetCourse (group + basic profile fields)."""
    if not user.email:
        return
    group = settings.GC_GROUP_PRO if sub_type == "pro" else settings.GC_GROUP_PLUS
    if not group:
        return

    profile_result = await session.execute(
        select(Profile).where(Profile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()

    addfields: dict = {}
    if settings.GC_FIELD_SUBSCRIPTION:
        addfields[settings.GC_FIELD_SUBSCRIPTION] = sub_type
    if settings.GC_FIELD_USERNAME and user.username:
        addfields[settings.GC_FIELD_USERNAME] = f"@{user.username}"
    if settings.GC_FIELD_REGISTERED_AT and user.created_at:
        addfields[settings.GC_FIELD_REGISTERED_AT] = user.created_at.strftime("%d.%m.%Y")
    if profile and settings.GC_FIELD_GOAL:
        goals = profile.goals or ([profile.goal.value] if profile.goal else [])
        if goals:
            addfields[settings.GC_FIELD_GOAL] = ", ".join(goals)

    try:
        await sync_user_to_gc(
            email=user.email,
            first_name=user.first_name or "",
            username=user.username or "",
            group_name=group,
            addfields=addfields,
        )
        logger.info("GC sync: subscriber %s pushed to group '%s'", user.telegram_id, group)
    except Exception as exc:
        logger.warning("GC sync failed for user %s: %s", user.telegram_id, exc)


# ── Suvvy AI webhook ──────────────────────────────────────────────────────────

@router.post("/suvvy")
async def suvvy_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    """
    Receive AI replies from Suvvy.
    Stores them in the in-memory queue (for polling) and saves to DB.
    """
    try:
        data = await request.json()
    except Exception:
        return {"status": "ok"}

    event_type = data.get("event_type", "")
    if event_type == "test_request":
        return {"status": "ok"}

    chat_id = str(data.get("chat_id", ""))
    new_messages = data.get("new_messages", [])

    texts = [
        m["text"]
        for m in new_messages
        if isinstance(m, dict) and m.get("type") == "text" and m.get("text")
    ]

    if not texts or not chat_id:
        return {"status": "ok"}

    # ── Parse [[MEAL:...]] markers ─────────────────────────────────────────────
    cleaned_texts: list[str] = []
    all_meals: list[dict] = []
    for raw_text in texts:
        cleaned, meals = _parse_meal_markers(raw_text)
        cleaned_texts.append(cleaned)   # may be empty string if text was only a marker
        all_meals.extend(meals)

    # Push only non-empty cleaned texts to the user-facing queue
    texts_to_send = [t for t in cleaned_texts if t.strip()]
    if texts_to_send:
        push(chat_id, texts_to_send)
        logger.info("Suvvy webhook: %d message(s) queued for chat_id=%s", len(texts_to_send), chat_id)

    result = await session.execute(
        select(User).where(User.telegram_id == int(chat_id))
    )
    user = result.scalar_one_or_none()

    if user:
        # Save cleaned AI messages (markers stripped)
        for text_body in cleaned_texts:
            if text_body.strip():
                session.add(AiMessage(user_id=user.id, role="ai", text=text_body))

        # Auto-create calorie trackers from photo recognition
        for meal in all_meals:
            session.add(Tracker(
                user_id=user.id,
                type=TrackerType.calories,
                value=meal["calories"],
                unit="kcal",
                meal_type=meal["meal_type"],
                label=meal["food"],
                source="photo",
            ))
            logger.info(
                "Photo calories logged: user=%s food=%r kcal=%s meal=%s",
                chat_id, meal["food"], meal["calories"], meal["meal_type"],
            )

        await session.flush()
        await _trim_ai_history(session, user.id)
        await session.commit()
    else:
        logger.warning("Suvvy webhook: user not found for chat_id=%s", chat_id)

    return {"status": "ok"}
