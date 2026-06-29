import asyncio
import json
import logging
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.bot_sender import send_message, send_video_note, webapp_kb
from api.services.getcourse import sync_user_to_gc
from api.services.history import schedule_fold
from api.suvvy_queue import push
from core.config import settings
from database.models import AiMessage, HealthMetrics, Profile, Tracker, TrackerType, User
from database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_MEAL_MARKER_RE = re.compile(r'\[\[MEAL:(\{.*?\})\]\]', re.DOTALL)
_VALID_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}
_WEIGHT_MARKER_RE = re.compile(r'\[\[WEIGHT:(\{.*?\})\]\]', re.DOTALL)
_WATER_MARKER_RE = re.compile(r'\[\[WATER:(\{.*?\})\]\]', re.DOTALL)
_SLEEP_MARKER_RE = re.compile(r'\[\[SLEEP:(\{.*?\})\]\]', re.DOTALL)
_HEALTH_METRICS_MARKER_RE = re.compile(r'\[\[HEALTH_METRICS:(\{.*?\})\]\]', re.DOTALL)
_HEALTH_METRICS_FIELDS = frozenset({
    "bmr", "bmi", "muscle_mass_kg", "fat_mass_kg",
    "visceral_fat", "metabolic_age", "body_fat_pct",
})

# ── RISK marker protocol ──────────────────────────────────────────────────────
_RISK_MARKER_RE = re.compile(r'\[\[RISK\]\]', re.IGNORECASE)
_APPROVED_RE    = re.compile(r'\[\[APPROVED\]\]', re.IGNORECASE)
_REJECT_RE      = re.compile(r'\[\[REJECT:([^\]]*)\]\]', re.IGNORECASE)

# Pending futures: validator responses keyed by risk_val_{uuid} chat_id
_RISK_VALIDATIONS: dict[str, "asyncio.Future[str]"] = {}
# Pending futures: specialist rewrite responses keyed by original user chat_id
_RISK_REWRITES: dict[str, "asyncio.Future[str]"] = {}
# Strong references to prevent GC of background tasks before completion
_RISK_TASKS: set[asyncio.Task] = set()

SUVVY_URL = "https://api.suvvy.ai/api/webhook/custom/message"


def _parse_meal_markers(text: str) -> tuple[str, list[dict]]:
    """
    Extract [[MEAL:{...}]] markers from AI response text.
    Only `food` and `calories` are read; `meal` field (if present) is ignored —
    meal_type is determined server-side by user timezone via _meal_type_by_time().

    Returns:
        (cleaned_text, list_of_meal_dicts)
        cleaned_text — text with markers removed and excess blank lines trimmed.
        Each meal_dict: {"food": str, "calories": int}

    Errors in JSON are logged as warnings; the marker is always removed from text.
    """
    meals: list[dict] = []

    def _handle_match(m: re.Match) -> str:
        try:
            payload = json.loads(m.group(1))
            food = payload.get("food", "")
            calories = payload.get("calories")

            if not food or not isinstance(food, str):
                raise ValueError("missing or invalid food field")
            if not isinstance(calories, (int, float)) or not (1 <= float(calories) <= 5000):
                raise ValueError(f"invalid calories: {calories!r}")

            meals.append({
                "food": food.strip(),
                "calories": int(calories),
            })
        except Exception as exc:
            logger.warning("Suvvy meal marker parse error: %s | raw=%r", exc, m.group(0))
        return ""  # always strip marker from visible text

    cleaned = _MEAL_MARKER_RE.sub(_handle_match, text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, meals


def _parse_weight_marker(text: str) -> tuple[str, float | None]:
    """
    Extract first valid [[WEIGHT:{"value": N}]] marker from text.
    Returns (cleaned_text, weight_kg) or (cleaned_text, None) if none/invalid.
    Valid range: 30–300 kg.  Marker is always removed from visible text.
    """
    weight: list[float] = []  # list so inner func can mutate

    def _handle_match(m: re.Match) -> str:
        try:
            payload = json.loads(m.group(1))
            val = payload.get("value")
            if not isinstance(val, (int, float)):
                raise ValueError(f"non-numeric value: {val!r}")
            val_f = float(val)
            if not (30 <= val_f <= 300):
                raise ValueError(f"out of range: {val_f}")
            if not weight:
                weight.append(round(val_f, 1))
        except Exception as exc:
            logger.warning("Suvvy weight marker parse error: %s | raw=%r", exc, m.group(0))
        return ""  # always strip marker from visible text

    cleaned = _WEIGHT_MARKER_RE.sub(_handle_match, text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, weight[0] if weight else None


def _parse_water_marker(text: str) -> tuple[str, float | None]:
    """
    Extract first valid [[WATER:{"value_ml": N}]] marker from text.
    Valid range: 50–5000 ml. Marker is always removed from visible text.
    """
    water: list[float] = []

    def _handle_match(m: re.Match) -> str:
        try:
            payload = json.loads(m.group(1))
            val = payload.get("value_ml")
            if not isinstance(val, (int, float)):
                raise ValueError(f"non-numeric value_ml: {val!r}")
            val_f = float(val)
            if not (50 <= val_f <= 5000):
                raise ValueError(f"out of range: {val_f}")
            if not water:
                water.append(round(val_f, 0))
        except Exception as exc:
            logger.warning("Suvvy water marker parse error: %s | raw=%r", exc, m.group(0))
        return ""

    cleaned = _WATER_MARKER_RE.sub(_handle_match, text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, water[0] if water else None


def _parse_sleep_marker(text: str) -> tuple[str, float | None]:
    """
    Extract first valid [[SLEEP:{"hours": N}]] marker from text.
    Valid range: 0–24 h. Marker is always removed from visible text.
    """
    sleep: list[float] = []

    def _handle_match(m: re.Match) -> str:
        try:
            payload = json.loads(m.group(1))
            val = payload.get("hours")
            if not isinstance(val, (int, float)):
                raise ValueError(f"non-numeric hours: {val!r}")
            val_f = float(val)
            if not (0 <= val_f <= 24):
                raise ValueError(f"out of range: {val_f}")
            if not sleep:
                sleep.append(round(val_f, 1))
        except Exception as exc:
            logger.warning("Suvvy sleep marker parse error: %s | raw=%r", exc, m.group(0))
        return ""

    cleaned = _SLEEP_MARKER_RE.sub(_handle_match, text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, sleep[0] if sleep else None


def _parse_health_metrics_marker(text: str) -> tuple[str, dict | None]:
    """
    Extract first [[HEALTH_METRICS:{...}]] marker from text.
    Accepted fields: bmr, bmi, muscle_mass_kg, fat_mass_kg, visceral_fat,
    metabolic_age, body_fat_pct — all optional, all must be numeric.
    Invalid JSON → warning; marker is always stripped.
    """
    hm: list[dict] = []

    def _handle_match(m: re.Match) -> str:
        try:
            payload = json.loads(m.group(1))
            result: dict[str, float] = {}
            for field in _HEALTH_METRICS_FIELDS:
                val = payload.get(field)
                if val is not None:
                    if not isinstance(val, (int, float)):
                        raise ValueError(f"non-numeric {field}: {val!r}")
                    result[field] = float(val)
            if result and not hm:
                hm.append(result)
        except Exception as exc:
            logger.warning("Suvvy health_metrics marker parse error: %s | raw=%r", exc, m.group(0))
        return ""

    cleaned = _HEALTH_METRICS_MARKER_RE.sub(_handle_match, text)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, hm[0] if hm else None


def _meal_type_by_time(profile) -> str:
    """Determine meal type from current local time in user's timezone."""
    offset = 3  # default МСК
    tz = getattr(profile, "timezone", None) if profile else None
    if tz and tz.startswith("UTC"):
        try:
            offset = int(tz.replace("UTC", "").replace("+", "") or "0")
        except ValueError:
            offset = 3
    local_hour = (datetime.now(timezone.utc) + timedelta(hours=offset)).hour
    if local_hour < 6:
        return "snack"      # 00:00–05:59 — ночь/перекус
    elif local_hour < 12:
        return "breakfast"  # 06:00–11:59
    elif local_hour < 18:
        return "lunch"      # 12:00–17:59
    else:
        return "dinner"     # 18:00–23:59


# ── RISK helpers ──────────────────────────────────────────────────────────────

def _safe_default_text() -> str:
    return (
        "По этому вопросу рекомендую проконсультироваться со специалистом. "
        f"Если нужна помощь — свяжись с поддержкой: {settings.SUPPORT_TG_URL}"
    )


async def _send_to_suvvy(chat_id: str, text_body: str, api_key: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as http:
            resp = await http.post(
                SUVVY_URL,
                json={
                    "api_version": 1,
                    "message_id": str(uuid.uuid4()),
                    "chat_id": chat_id,
                    "message_sender": "customer",
                    "source": "RISK_INTERNAL",
                    "text": text_body,
                },
                headers={"Authorization": f"Bearer {api_key}"},
            )
            resp.raise_for_status()
            return True
    except Exception as exc:
        logger.error("RISK send_to_suvvy chat_id=%s error: %s", chat_id, exc)
        return False


async def _handle_risk_async(
    original_chat_id: str,
    risk_text: str,
    user_id: int,
) -> None:
    """
    Background task: validate a [[RISK]]-tagged specialist response.
    Pushes final text to user and saves to DB regardless of outcome.
    Max 1 validation round + 1 rewrite attempt; on failure → safe default.
    """
    from database.session import AsyncSessionLocal

    half_budget = settings.SUVVY_RISK_TIMEOUT // 2

    final_text: str

    if not settings.SUVVY_VALIDATOR_KEY:
        # Validator not configured — pass through immediately
        final_text = risk_text
    else:
        # ── Step 1: send to validator agent ───────────────────────────────
        val_id = f"risk_val_{uuid.uuid4().hex[:12]}"
        loop = asyncio.get_event_loop()
        val_future: asyncio.Future[str] = loop.create_future()
        _RISK_VALIDATIONS[val_id] = val_future

        sent = await _send_to_suvvy(val_id, risk_text, settings.SUVVY_VALIDATOR_KEY)
        if not sent:
            _RISK_VALIDATIONS.pop(val_id, None)
            final_text = _safe_default_text()
        else:
            # ── Step 2: wait for [[APPROVED]] or [[REJECT:...]] ───────────
            try:
                val_response = await asyncio.wait_for(val_future, timeout=half_budget)
            except asyncio.TimeoutError:
                logger.warning("RISK: validator timeout chat_id=%s", original_chat_id)
                _RISK_VALIDATIONS.pop(val_id, None)
                final_text = _safe_default_text()
            else:
                _RISK_VALIDATIONS.pop(val_id, None)

                if _APPROVED_RE.search(val_response):
                    logger.info("RISK: approved chat_id=%s", original_chat_id)
                    final_text = risk_text
                else:
                    # ── Step 3: rejected — request specialist rewrite ──────
                    match = _REJECT_RE.search(val_response)
                    reason = match.group(1).strip() if match else "general"
                    logger.warning(
                        "RISK: rejected reason=%r chat_id=%s", reason, original_chat_id
                    )

                    rw_future: asyncio.Future[str] = loop.create_future()
                    _RISK_REWRITES[original_chat_id] = rw_future

                    rewrite_prompt = (
                        f"ВАЛИДАТОР ОТКЛОНИЛ ОТВЕТ [{reason}]. "
                        f"Перепиши безопаснее:\n\n{risk_text}"
                    )
                    sent_rw = await _send_to_suvvy(
                        original_chat_id, rewrite_prompt, settings.SUVVY_API_KEY
                    )

                    if not sent_rw:
                        _RISK_REWRITES.pop(original_chat_id, None)
                        final_text = _safe_default_text()
                    else:
                        try:
                            final_text = await asyncio.wait_for(
                                rw_future, timeout=half_budget
                            )
                            logger.info("RISK: rewrite received chat_id=%s", original_chat_id)
                        except asyncio.TimeoutError:
                            logger.warning(
                                "RISK: rewrite timeout chat_id=%s", original_chat_id
                            )
                            final_text = _safe_default_text()
                        finally:
                            _RISK_REWRITES.pop(original_chat_id, None)

    # ── Deliver to user ───────────────────────────────────────────────────────
    push(original_chat_id, [final_text])
    async with AsyncSessionLocal() as db:
        db.add(AiMessage(user_id=user_id, role="ai", text=final_text))
        await db.commit()


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


# ── GetCourse webhook ─────────────────────────────────────────────────────────

@router.post("/getcourse")
async def getcourse_webhook(request: Request):  # noqa: no session — diagnostic only
    # TODO: убрать после диагностики формата GC
    raw_body = await request.body()
    logger.warning(
        "GC_WEBHOOK_RAW headers=%s body=%s",
        dict(request.headers),
        raw_body.decode("utf-8", errors="replace"),
    )
    content_type = request.headers.get("content-type", "")
    if "form" in content_type:
        form = await request.form()
        logger.warning("GC_WEBHOOK_FORM %s", dict(form))
    elif "json" in content_type:
        try:
            logger.warning("GC_WEBHOOK_JSON %s", await request.json())
        except Exception:
            pass

    # --- старая бизнес-логика (матчинг по email) закомментирована до
    #     выяснения реального формата полей, которые шлёт GetCourse ---
    #
    # result = await session.execute(select(User).where(User.email == email))
    # user = result.scalar_one_or_none()
    # if not user:
    #     logger.warning("GC webhook: user not found for email=%s", email)
    #     return {"status": "ok", "message": "user not found"}
    # if event == "payment":
    #     sub_type, period_days = _resolve_offer(offer_code)
    #     ...  (активация подписки, welcome-push, sync_to_gc)
    # elif event == "refund":
    #     ...  (деактивация, refund-push)

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

    # ── Route internal RISK responses ─────────────────────────────────────────
    # Validator agent responds to a synthetic chat_id "risk_val_{uuid}"
    if chat_id.startswith("risk_val_"):
        fut = _RISK_VALIDATIONS.pop(chat_id, None)
        if fut and not fut.done():
            fut.set_result("\n".join(texts))
        return {"status": "ok"}

    # Specialist rewrite response for a pending risk cycle
    rw_fut = _RISK_REWRITES.get(chat_id)
    if rw_fut and not rw_fut.done():
        rw_fut.set_result("\n".join(texts))
        _RISK_REWRITES.pop(chat_id, None)
        return {"status": "ok"}

    # ── Parse all AI markers ──────────────────────────────────────────────────
    cleaned_texts: list[str] = []
    all_meals: list[dict] = []
    weight_kg: float | None = None
    water_ml: float | None = None
    sleep_h: float | None = None
    health_metrics_data: dict | None = None
    for raw_text in texts:
        cleaned, meals = _parse_meal_markers(raw_text)
        cleaned, w = _parse_weight_marker(cleaned)
        cleaned, wm = _parse_water_marker(cleaned)
        cleaned, sl = _parse_sleep_marker(cleaned)
        cleaned, hm = _parse_health_metrics_marker(cleaned)
        cleaned_texts.append(cleaned)   # may be empty string if text was only a marker
        all_meals.extend(meals)
        if w is not None and weight_kg is None:
            weight_kg = w
        if wm is not None and water_ml is None:
            water_ml = wm
        if sl is not None and sleep_h is None:
            sleep_h = sl
        if hm is not None and health_metrics_data is None:
            health_metrics_data = hm

    # ── Detect and handle [[RISK]] marker ─────────────────────────────────────
    risk_texts: list[str] = []
    safe_texts: list[str] = []
    for t in cleaned_texts:
        if _RISK_MARKER_RE.search(t):
            risk_texts.append(_RISK_MARKER_RE.sub("", t).strip())
        else:
            safe_texts.append(t)

    # Non-risk messages push immediately
    texts_to_send = [t for t in safe_texts if t.strip()]
    if texts_to_send:
        push(chat_id, texts_to_send)
        logger.info("Suvvy webhook: %d message(s) queued for chat_id=%s", len(texts_to_send), chat_id)

    result = await session.execute(
        select(User).where(User.telegram_id == int(chat_id))
    )
    user = result.scalar_one_or_none()

    if user:
        # Save safe (non-RISK) AI messages
        for text_body in safe_texts:
            if text_body.strip():
                session.add(AiMessage(user_id=user.id, role="ai", text=text_body))

        # Auto-create calorie trackers from photo recognition
        if all_meals:
            profile_result = await session.execute(
                select(Profile).where(Profile.user_id == user.id)
            )
            profile = profile_result.scalar_one_or_none()
            meal_type = _meal_type_by_time(profile)

            for meal in all_meals:
                session.add(Tracker(
                    user_id=user.id,
                    type=TrackerType.calories,
                    value=meal["calories"],
                    unit="kcal",
                    meal_type=meal_type,
                    label=meal["food"],
                    source="photo",
                ))
                logger.info(
                    "Photo calories logged: user=%s food=%r kcal=%s meal=%s",
                    chat_id, meal["food"], meal["calories"], meal_type,
                )

        # Upsert weight tracker from [[WEIGHT:]] marker
        if weight_kg is not None:
            today = datetime.now(timezone.utc).date()
            existing = (await session.execute(
                select(Tracker).where(
                    and_(
                        Tracker.user_id == user.id,
                        Tracker.type == TrackerType.weight,
                        func.date(Tracker.created_at) == today,
                    )
                ).limit(1)
            )).scalar_one_or_none()
            if existing:
                existing.value = weight_kg
                logger.info("Weight updated via marker: user=%s weight=%.1f", chat_id, weight_kg)
            else:
                session.add(Tracker(
                    user_id=user.id,
                    type=TrackerType.weight,
                    value=weight_kg,
                    unit="kg",
                ))
                logger.info("Weight logged via marker: user=%s weight=%.1f", chat_id, weight_kg)

        # Water tracker from [[WATER:]] marker (additive — sum over the day)
        if water_ml is not None:
            session.add(Tracker(
                user_id=user.id,
                type=TrackerType.water,
                value=water_ml,
                unit="ml",
            ))
            logger.info("Water logged via marker: user=%s ml=%.0f", chat_id, water_ml)

        # Sleep tracker from [[SLEEP:]] marker (upsert today's entry)
        if sleep_h is not None:
            today = datetime.now(timezone.utc).date()
            existing_sleep = (await session.execute(
                select(Tracker).where(
                    and_(
                        Tracker.user_id == user.id,
                        Tracker.type == TrackerType.sleep,
                        func.date(Tracker.created_at) == today,
                    )
                ).limit(1)
            )).scalar_one_or_none()
            if existing_sleep:
                existing_sleep.value = sleep_h
                logger.info("Sleep updated via marker: user=%s hours=%.1f", chat_id, sleep_h)
            else:
                session.add(Tracker(
                    user_id=user.id,
                    type=TrackerType.sleep,
                    value=sleep_h,
                    unit="h",
                ))
                logger.info("Sleep logged via marker: user=%s hours=%.1f", chat_id, sleep_h)

        # HealthMetrics snapshot from [[HEALTH_METRICS:]] marker
        if health_metrics_data is not None:
            session.add(HealthMetrics(user_id=user.id, **health_metrics_data))
            logger.info(
                "HealthMetrics logged via marker: user=%s fields=%s",
                chat_id, sorted(health_metrics_data.keys()),
            )

        await session.commit()
        schedule_fold(user.id)

        # Launch RISK validation in background (max 1 round, then safe default)
        for risk_text in risk_texts:
            logger.info("RISK: launching validation for chat_id=%s", chat_id)
            task = asyncio.create_task(_handle_risk_async(chat_id, risk_text, user.id))
            _RISK_TASKS.add(task)
            task.add_done_callback(_RISK_TASKS.discard)

    else:
        logger.warning("Suvvy webhook: user not found for chat_id=%s", chat_id)

    return {"status": "ok"}
