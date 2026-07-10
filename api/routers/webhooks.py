import asyncio
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Form, Request
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from api.bot_sender import send_message, send_video_note, webapp_kb
from api.services.getcourse import sync_user_to_gc
from api.services.history import schedule_fold
from api.suvvy_queue import push
from core.config import settings
from core.utils.phone import normalize_phone
from database.models import AiMessage, GcSubscription, GcStatus, GcTier, HealthMetrics, Profile, SubscriptionStatus, Tracker, TrackerType, User, Workout
from database.session import get_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])

_VALID_MEAL_TYPES = {"breakfast", "lunch", "dinner", "snack"}
_HEALTH_METRICS_FIELDS = frozenset({
    "bmr", "bmi", "muscle_mass_kg", "fat_mass_kg",
    "visceral_fat", "metabolic_age", "body_fat_pct",
})


def _extract_json_markers(text: str, name: str) -> list[tuple[str, int, int]]:
    """
    Find every occurrence of [[NAME:{...}]] in text, tolerant of malformed
    closing brackets. mini frequently mis-terminates long markers (e.g.
    "}}]" or "}]" instead of the correct "}]]") — rather than requiring an
    exact "]]" tail, the JSON object is located by brace-balance counting
    from the first "{", and whatever junk brackets/whitespace follow the
    real closing "}" are swallowed as part of the match.

    Returns a list of (json_str, start, end) in text order; start/end span
    the whole marker occurrence (prefix + object + any bracket noise) so
    callers can cut it out of the visible text.
    """
    start_re = re.compile(r'\[\[' + re.escape(name) + r':\s*(\{)')
    spans: list[tuple[str, int, int]] = []
    pos = 0
    while True:
        m = start_re.search(text, pos)
        if not m:
            break
        obj_start = m.start(1)
        depth = 0
        in_str = False
        escape = False
        end = None
        for i in range(obj_start, len(text)):
            ch = text[i]
            if in_str:
                if escape:
                    escape = False
                elif ch == '\\':
                    escape = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == '{':
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0:
                    end = i + 1
                    break
        if end is None:
            # Unbalanced braces, no closing found at all — skip past this
            # start so we don't loop forever, try the next occurrence.
            pos = m.end()
            continue
        tail_end = end
        while tail_end < len(text) and text[tail_end] in ']} \t':
            tail_end += 1
        spans.append((text[obj_start:end], m.start(), tail_end))
        pos = tail_end
    return spans


def _parse_marker(text: str, name: str, handle) -> str:
    """
    Generic marker-stripping driver built on _extract_json_markers: for
    every occurrence of [[NAME:{...}]] (however it was mis-closed), call
    handle(payload_dict) and remove the whole occurrence from the visible
    text — regardless of whether the JSON parsed/validated, so a broken
    marker never leaks into what the user sees. Catches multiple markers
    of the same type, including several on one line.
    """
    spans = _extract_json_markers(text, name)
    if not spans:
        return text
    parts = []
    last = 0
    for json_str, start, end in spans:
        parts.append(text[last:start])
        try:
            payload = json.loads(json_str)
            handle(payload)
        except Exception as exc:
            logger.warning("Suvvy %s marker parse error: %s | raw=%r", name, exc, json_str)
        last = end
    parts.append(text[last:])
    return ''.join(parts)

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
    `food` and `calories` are required; `protein_g`/`fat_g`/`carbs_g` are read
    if present (optional — the AI prompt doesn't send them yet, this is just
    forward-compatible plumbing). `meal` field (if present) is ignored —
    meal_type is determined server-side by user timezone via _meal_type_by_time().

    Returns:
        (cleaned_text, list_of_meal_dicts)
        cleaned_text — text with markers removed and excess blank lines trimmed.
        Each meal_dict: {"food": str, "calories": int, "protein_g"?, "fat_g"?, "carbs_g"?}

    Errors in JSON are logged as warnings; the marker is always removed from text.
    """
    meals: list[dict] = []

    def _macro(payload: dict, key: str) -> float | None:
        v = payload.get(key)
        return float(v) if isinstance(v, (int, float)) and 0 <= v <= 1000 else None

    def _handle(payload: dict) -> None:
        food = payload.get("food", "")
        calories = payload.get("calories")

        if not food or not isinstance(food, str):
            raise ValueError("missing or invalid food field")
        if not isinstance(calories, (int, float)) or not (1 <= float(calories) <= 5000):
            raise ValueError(f"invalid calories: {calories!r}")

        meals.append({
            "food": food.strip(),
            "calories": int(calories),
            "protein_g": _macro(payload, "protein_g"),
            "fat_g": _macro(payload, "fat_g"),
            "carbs_g": _macro(payload, "carbs_g"),
        })

    cleaned = _parse_marker(text, "MEAL", _handle)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, meals


def _parse_weight_marker(text: str) -> tuple[str, float | None]:
    """
    Extract first valid [[WEIGHT:{"value": N}]] marker from text.
    Returns (cleaned_text, weight_kg) or (cleaned_text, None) if none/invalid.
    Valid range: 30–300 kg.  Marker is always removed from visible text.
    """
    weight: list[float] = []  # list so inner func can mutate

    def _handle(payload: dict) -> None:
        val = payload.get("value")
        if not isinstance(val, (int, float)):
            raise ValueError(f"non-numeric value: {val!r}")
        val_f = float(val)
        if not (30 <= val_f <= 300):
            raise ValueError(f"out of range: {val_f}")
        if not weight:
            weight.append(round(val_f, 1))

    cleaned = _parse_marker(text, "WEIGHT", _handle)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, weight[0] if weight else None


def _parse_water_marker(text: str) -> tuple[str, float | None]:
    """
    Extract first valid [[WATER:{"value_ml": N}]] marker from text.
    Valid range: 50–5000 ml. Marker is always removed from visible text.
    """
    water: list[float] = []

    def _handle(payload: dict) -> None:
        val = payload.get("value_ml")
        if not isinstance(val, (int, float)):
            raise ValueError(f"non-numeric value_ml: {val!r}")
        val_f = float(val)
        if not (50 <= val_f <= 5000):
            raise ValueError(f"out of range: {val_f}")
        if not water:
            water.append(round(val_f, 0))

    cleaned = _parse_marker(text, "WATER", _handle)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, water[0] if water else None


def _parse_sleep_marker(text: str) -> tuple[str, float | None]:
    """
    Extract first valid [[SLEEP:{"hours": N}]] marker from text.
    Valid range: 0–24 h. Marker is always removed from visible text.
    """
    sleep: list[float] = []

    def _handle(payload: dict) -> None:
        val = payload.get("hours")
        if not isinstance(val, (int, float)):
            raise ValueError(f"non-numeric hours: {val!r}")
        val_f = float(val)
        if not (0 <= val_f <= 24):
            raise ValueError(f"out of range: {val_f}")
        if not sleep:
            sleep.append(round(val_f, 1))

    cleaned = _parse_marker(text, "SLEEP", _handle)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, sleep[0] if sleep else None


def _parse_pulse_marker(text: str) -> tuple[str, int | None]:
    """
    Extract first valid [[PULSE:{"bpm": N}]] marker from text.
    Valid range: 30–220 bpm. Marker is always removed from visible text.
    """
    pulse: list[int] = []

    def _handle(payload: dict) -> None:
        val = payload.get("bpm")
        if not isinstance(val, (int, float)):
            raise ValueError(f"non-numeric bpm: {val!r}")
        val_i = round(float(val))
        if not (30 <= val_i <= 220):
            raise ValueError(f"out of range: {val_i}")
        if not pulse:
            pulse.append(val_i)

    cleaned = _parse_marker(text, "PULSE", _handle)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, pulse[0] if pulse else None


def _parse_health_metrics_marker(text: str) -> tuple[str, dict | None]:
    """
    Extract first [[HEALTH_METRICS:{...}]] marker from text.
    Accepted fields: bmr, bmi, muscle_mass_kg, fat_mass_kg, visceral_fat,
    metabolic_age, body_fat_pct — all optional, all must be numeric.
    Invalid JSON → warning; marker is always stripped.
    """
    hm: list[dict] = []

    def _handle(payload: dict) -> None:
        result: dict[str, float] = {}
        for field in _HEALTH_METRICS_FIELDS:
            val = payload.get(field)
            if val is not None:
                if not isinstance(val, (int, float)):
                    raise ValueError(f"non-numeric {field}: {val!r}")
                result[field] = float(val)
        if result and not hm:
            hm.append(result)

    cleaned = _parse_marker(text, "HEALTH_METRICS", _handle)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, hm[0] if hm else None


def _parse_workout_planned_markers(text: str) -> tuple[str, list[dict]]:
    """
    Extract [[WORKOUT_PLANNED:{"date","note"}]] markers from text. There is
    no category field anymore — plans are written as a plain Workout row
    with category_id=NULL (see database/migrations/0023) and the full
    day's exercise list (with its own \n / bullet formatting) lives in
    note verbatim. Missing/invalid date -> today, resolved at write time.
    Marker is always removed from visible text regardless of whether the
    payload parses; a response may contain multiple markers (one per day),
    and _parse_marker strips + collects every occurrence, not just the
    first — including mis-closed ones (mini often ends long notes with
    "}}]" or "}]" instead of "}]]"; see _extract_json_markers).

    Returns:
        (cleaned_text, list_of_plan_dicts)
        Each plan_dict: {"date": str|None, "note": str|None}
    """
    planned: list[dict] = []

    def _handle(payload: dict) -> None:
        date_raw = payload.get("date")
        note_raw = payload.get("note")
        planned.append({
            "date": date_raw.strip() if isinstance(date_raw, str) and date_raw.strip() else None,
            "note": note_raw.strip()[:2048] if isinstance(note_raw, str) and note_raw.strip() else None,
        })

    cleaned = _parse_marker(text, "WORKOUT_PLANNED", _handle)
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned).strip()
    return cleaned, planned


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

def _apply_subscription_to_user(
    user: User,
    tier: str | None,
    active: str,
    expires_at: datetime | None = None,
) -> None:
    """Set the 4 User subscription fields consistently for payment and refund.

    Gating checks by_active (subscription_active=="active") OR by_status
    (subscription_status==premium) — both signals must move together, otherwise
    a stale legacy status="premium" alone would keep access open after a refund.
    """
    was_active = (user.subscription_active == "active")
    user.subscription_type = tier
    user.subscription_active = active
    user.subscription_expires_at = expires_at
    user.subscription_status = SubscriptionStatus.premium if active == "active" else SubscriptionStatus.free
    # Only stamp activation on the inactive/None → active transition, not on renewals
    if active == "active" and not was_active:
        user.subscription_activated_at = datetime.now(timezone.utc)


@router.post("/getcourse")
async def getcourse_webhook(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> dict:
    raw_body = await request.body()
    raw_str = raw_body.decode("utf-8", errors="replace")
    logger.info("GC_WEBHOOK body=%s", raw_str)

    try:
        form = await request.form()
        data = dict(form)
    except Exception:
        # fallback: try parsing raw body manually
        from urllib.parse import parse_qs
        parsed = parse_qs(raw_str)
        data = {k: v[0] for k, v in parsed.items()}

    event = data.get("event", "").strip().lower()
    raw_phone = data.get("phone", "")
    email = (data.get("email") or "").strip() or None
    raw_tier = (data.get("tier") or "").strip().lower()
    offer_code = (data.get("offer_id") or data.get("offer_code") or "").strip()
    raw_payed_at = (data.get("payed_at") or "").strip()

    # tg_id — optional, passed via payment URL parameter (Part В)
    tg_id: int | None = None
    raw_tg_id = (data.get("tg_id") or "").strip()
    if raw_tg_id:
        try:
            tg_id = int(raw_tg_id)
        except ValueError:
            logger.warning("GC webhook: invalid tg_id=%r", raw_tg_id)

    phone = normalize_phone(raw_phone)
    if not phone:
        logger.warning("GC webhook: unrecognised phone=%r body=%s", raw_phone, raw_str)
        return {"status": "ok"}

    # Resolve tier
    if raw_tier in ("plus", "pro"):
        tier = GcTier(raw_tier)
        period_days = 30
    else:
        sub_type, period_days = _resolve_offer(offer_code)
        if not sub_type:
            logger.warning("GC webhook: unknown tier/offer phone=%s offer=%r", phone, offer_code)
            return {"status": "ok"}
        tier = GcTier(sub_type)

    # Parse payed_at
    payed_at: datetime | None = None
    if raw_payed_at:
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
            try:
                payed_at = datetime.strptime(raw_payed_at, fmt).replace(tzinfo=timezone.utc)
                break
            except ValueError:
                pass
    if payed_at is None:
        payed_at = datetime.now(timezone.utc)

    # Find GcSubscription: prefer tg_id lookup when available (proactive push path)
    sub: GcSubscription | None = None
    if tg_id:
        result = await session.execute(
            select(GcSubscription).where(GcSubscription.telegram_id == tg_id)
        )
        sub = result.scalar_one_or_none()
    if sub is None:
        result = await session.execute(
            select(GcSubscription).where(GcSubscription.phone_normalized == phone)
        )
        sub = result.scalar_one_or_none()

    if event == "payment":
        expires_at = payed_at + timedelta(days=period_days)
        if sub:
            sub.tier = tier
            sub.status = GcStatus.active
            sub.payed_at = payed_at
            sub.expires_at = expires_at
            if email:
                sub.email = email
            if tg_id and sub.telegram_id is None:
                sub.telegram_id = tg_id
        else:
            sub = GcSubscription(
                phone_normalized=phone,
                email=email,
                tier=tier,
                status=GcStatus.active,
                payed_at=payed_at,
                expires_at=expires_at,
                telegram_id=tg_id,
            )
            session.add(sub)
        await session.commit()
        await session.refresh(sub)
        logger.info("GC payment recorded phone=%s tier=%s expires=%s tg_id=%s", phone, tier, expires_at, sub.telegram_id)

        # Update User subscription fields and send push if telegram_id is known
        effective_tg_id = sub.telegram_id
        if effective_tg_id:
            user_res = await session.execute(
                select(User).where(User.telegram_id == effective_tg_id)
            )
            user = user_res.scalar_one_or_none()
            if user:
                _apply_subscription_to_user(user, tier.value, "active", expires_at)
                await session.commit()
                logger.info("GC payment: updated User sub fields for tg_id=%s", effective_tg_id)
                name = user.first_name or "друг"
                if tier.value == "plus":
                    _spawn(_run_plus_payment_funnel(effective_tg_id, name))
                elif tier.value == "pro":
                    _spawn(_run_pro_payment_funnel(effective_tg_id, name))
                else:
                    # GcTier only has plus/pro today — kept as an explicit
                    # fallback rather than silently dropping the push if a
                    # third tier is ever added.
                    await _send_payment_welcome(effective_tg_id, tier.value)
            else:
                # No local User row yet (tg_id known via GC only) — no
                # first_name to personalise the funnel with, fall back to
                # the generic welcome.
                await _send_payment_welcome(effective_tg_id, tier.value)

    elif event == "refund":
        if sub:
            sub.status = GcStatus.cancelled
            await session.commit()
            logger.info("GC refund recorded phone=%s", phone)
            if sub.telegram_id:
                user_res = await session.execute(
                    select(User).where(User.telegram_id == sub.telegram_id)
                )
                user = user_res.scalar_one_or_none()
                if user:
                    _apply_subscription_to_user(user, None, "inactive")
                    await session.commit()
                    logger.info("GC refund: reset User sub fields for tg_id=%s", sub.telegram_id)
                await _send_refund_notice(sub.telegram_id)
        else:
            logger.warning("GC refund: no subscription found for phone=%s", phone)

    else:
        logger.warning("GC webhook: unknown event=%r", event)

    return {"status": "ok"}


# ── Tier-specific payment funnels (PLUS/PRO) ────────────────────────────────
# This module runs in the API process (FastAPI), which has no aiogram Bot
# instance of its own (that lives in bot/main.py, a separate container/
# process — see bot/main.py's `bot = Bot(...)`). funnel_content.py's send_*
# functions need one, so each funnel run opens its own short-lived Bot via
# `async with`, which closes its session when the chain finishes.
#
# Delays (10s / 10min) are done with asyncio.sleep inside a background
# task rather than persistent APScheduler jobs — these are one-shot,
# short (<= ~20 min total), per-payment-event sequences with no need to
# survive a restart, per ТЗ «онбординг с проверкой телефона», 2026-07-10
# section 6/4.2. (Contrast with the nonpayer dunning sequence in
# bot/scheduler.py, whose 24h/3-day delays are far too long to trust to
# an in-memory sleep and are instead backed by a DB row + polling job.)

_background_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    """Fire-and-forget a background task, keeping a strong reference so
    it isn't garbage-collected mid-flight (an un-referenced asyncio task
    can be GC'd before it finishes — a well-known footgun)."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _run_plus_payment_funnel(chat_id: int, name: str) -> None:
    from aiogram import Bot
    from bot.funnel_content import send_paid_plus_circle, send_paid_plus_welcome

    try:
        async with Bot(token=settings.BOT_TOKEN) as bot:
            await send_paid_plus_circle(bot, chat_id)
            await asyncio.sleep(10)
            await send_paid_plus_welcome(bot, chat_id, name)
    except Exception as exc:
        logger.error("PLUS payment funnel failed for chat_id=%s: %s", chat_id, exc)


async def _run_pro_payment_funnel(chat_id: int, name: str) -> None:
    from aiogram import Bot
    from bot.funnel_content import (
        send_paid_pro_circle, send_paid_pro_step2, send_paid_pro_step3, send_paid_pro_welcome,
    )

    try:
        async with Bot(token=settings.BOT_TOKEN) as bot:
            await send_paid_pro_circle(bot, chat_id)
            await asyncio.sleep(10)
            await send_paid_pro_welcome(bot, chat_id, name)
            await asyncio.sleep(600)
            await send_paid_pro_step2(bot, chat_id)
            await asyncio.sleep(600)
            await send_paid_pro_step3(bot, chat_id)
    except Exception as exc:
        logger.error("PRO payment funnel failed for chat_id=%s: %s", chat_id, exc)


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
@router.post("/suvvy/")
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
    logger.info(
        "Suvvy webhook received: chat_id=%s event_type=%r message_count=%d keys=%s",
        chat_id, event_type, len(new_messages) if isinstance(new_messages, list) else 0,
        sorted(data.keys()),
    )

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
    all_workout_plans: list[dict] = []
    weight_kg: float | None = None
    water_ml: float | None = None
    sleep_h: float | None = None
    pulse_bpm: int | None = None
    health_metrics_data: dict | None = None
    for raw_text in texts:
        cleaned, meals = _parse_meal_markers(raw_text)
        cleaned, w = _parse_weight_marker(cleaned)
        cleaned, wm = _parse_water_marker(cleaned)
        cleaned, sl = _parse_sleep_marker(cleaned)
        cleaned, pl = _parse_pulse_marker(cleaned)
        cleaned, hm = _parse_health_metrics_marker(cleaned)
        cleaned, plans = _parse_workout_planned_markers(cleaned)
        cleaned_texts.append(cleaned)   # may be empty string if text was only a marker
        all_meals.extend(meals)
        all_workout_plans.extend(plans)
        if w is not None and weight_kg is None:
            weight_kg = w
        if wm is not None and water_ml is None:
            water_ml = wm
        if sl is not None and sleep_h is None:
            sleep_h = sl
        if pl is not None and pulse_bpm is None:
            pulse_bpm = pl
        if hm is not None and health_metrics_data is None:
            health_metrics_data = hm

    # ── Diagnose silently-lost workout markers ──────────────────────────────
    # _parse_marker already logs a warning when it finds a [[WORKOUT_PLANNED:
    # marker whose JSON body fails to parse — but if Suvvy emits the marker
    # name slightly wrong (typo, different casing/spacing, wrong brackets:
    # e.g. [[WORKOUT_PLAN: instead of [[WORKOUT_PLANNED:),
    # _extract_json_markers never matches it at all and NOTHING gets logged,
    # so a workout the agent clearly tried to save just silently vanishes.
    # Deliberately loose match (just "workout", not the exact marker name)
    # so a typo'd marker name still gets caught — verified against a
    # WORKOUT_PLAN (missing "NED") typo, which an exact-string check misses
    # entirely. False positives (AI casually using the English word) just
    # cost a spurious log line; a real miss costs a silently lost workout.
    # See ТЗ «пул правок» 2026-07-10, п.9.
    if not all_workout_plans:
        for raw_text in texts:
            if "workout" in raw_text.lower():
                logger.warning(
                    "Suvvy webhook: chat_id=%s mentions 'workout' but no "
                    "WORKOUT_PLANNED marker was extracted (malformed/mistyped "
                    "marker syntax?) raw=%r",
                    chat_id, raw_text[:2000],
                )

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

    try:
        chat_id_int = int(chat_id)
    except ValueError:
        logger.warning("Suvvy webhook: non-numeric chat_id=%r", chat_id)
        return {"status": "ok"}

    try:
        result = await session.execute(
            select(User).where(User.telegram_id == chat_id_int)
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
                        protein_g=meal.get("protein_g"),
                        fat_g=meal.get("fat_g"),
                        carbs_g=meal.get("carbs_g"),
                    ))
                    logger.info(
                        "Photo calories logged: user=%s food=%r kcal=%s meal=%s",
                        chat_id, meal["food"], meal["calories"], meal_type,
                    )

            # Calendar entries from [[WORKOUT_PLANNED:]] marker(s) — Workout row only,
            # no category (category_id=NULL, see migration 0023) and no WorkoutEntry;
            # the full day's exercise list is written verbatim into note.
            if all_workout_plans:
                today = datetime.now(timezone.utc).date()

                for plan in all_workout_plans:
                    plan_date = today
                    if plan["date"]:
                        try:
                            plan_date = date.fromisoformat(plan["date"])
                        except ValueError:
                            logger.warning(
                                "WORKOUT_PLANNED: invalid date=%r, defaulting to today (user=%s)",
                                plan["date"], chat_id,
                            )

                    session.add(Workout(
                        user_id=user.id,
                        date=plan_date,
                        category_id=None,
                        note=plan["note"],
                    ))
                    logger.info(
                        "Workout planned via marker: user=%s date=%s note=%r",
                        chat_id, plan_date, plan["note"],
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

            # Pulse tracker from [[PULSE:]] marker (upsert today's entry)
            if pulse_bpm is not None:
                today = datetime.now(timezone.utc).date()
                existing_pulse = (await session.execute(
                    select(Tracker).where(
                        and_(
                            Tracker.user_id == user.id,
                            Tracker.type == TrackerType.pulse,
                            func.date(Tracker.created_at) == today,
                        )
                    ).limit(1)
                )).scalar_one_or_none()
                if existing_pulse:
                    existing_pulse.value = pulse_bpm
                    logger.info("Pulse updated via marker: user=%s bpm=%d", chat_id, pulse_bpm)
                else:
                    session.add(Tracker(
                        user_id=user.id,
                        type=TrackerType.pulse,
                        value=pulse_bpm,
                        unit="bpm",
                    ))
                    logger.info("Pulse logged via marker: user=%s bpm=%d", chat_id, pulse_bpm)

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
    except Exception:
        await session.rollback()
        logger.exception("Suvvy webhook: unhandled error persisting reply for chat_id=%s", chat_id)
        return {"status": "ok"}

    return {"status": "ok"}
