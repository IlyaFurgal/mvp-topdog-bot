import logging
from datetime import date, datetime, timedelta, timezone

import pytz
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import and_, func, select, or_

from api.routers.trackers import calculate_calorie_limit
from api.services.getcourse import sync_progress_to_gc
from core.config import settings
from database.models import (
    Checkin, CheckinType, Profile, Tracker, TrackerType, UpgradeIntent, User,
)
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
MOSCOW = pytz.timezone("Europe/Moscow")

# ── In-memory dedup: (user_id, checkin_type) → date last sent ────────────────
_reminder_sent: dict[tuple[int, str], date] = {}

# ── Per-user training notify target cache: user_id → (target_hhmm | None, cached_date)
# Populated once per day per user from morning checkin; None means no push needed.
# Cleared automatically when date changes (stale cleanup at end of check_reminders).
_training_notify_cache: dict[int, tuple[str | None, date]] = {}


def _webapp_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="Открыть приложение",
            web_app=WebAppInfo(url=settings.mini_app_url_versioned),
        )
    ]])


def _url_kb(text: str, url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=text, url=url)
    ]])


async def _has_morning_checkin_today(session, user_id: int) -> bool:
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    result = await session.execute(
        select(Checkin).where(
            and_(
                Checkin.user_id == user_id,
                Checkin.type == CheckinType.morning,
                Checkin.created_at >= today_start,
            )
        )
    )
    return result.scalar_one_or_none() is not None


async def _has_post_workout_today(session, user_id: int) -> bool:
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    result = await session.execute(
        select(Checkin).where(
            and_(
                Checkin.user_id == user_id,
                Checkin.type == CheckinType.post_workout,
                Checkin.created_at >= today_start,
            )
        )
    )
    return result.scalar_one_or_none() is not None


async def _get_morning_training_time(session, user_id: int) -> tuple[bool, str | None]:
    """Return (is_training_today, training_time_hhmm) from today's latest morning checkin."""
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(tzinfo=timezone.utc)
    result = await session.execute(
        select(Checkin).where(
            and_(
                Checkin.user_id == user_id,
                Checkin.type == CheckinType.morning,
                Checkin.created_at >= today_start,
            )
        ).order_by(Checkin.created_at.desc()).limit(1)
    )
    checkin = result.scalar_one_or_none()
    if not checkin or not checkin.data:
        return False, None
    data = checkin.data
    if data.get("training_today") != "train":
        return False, None
    raw = data.get("training_time")
    if isinstance(raw, str) and ":" in raw:
        return True, raw
    return True, None


def _compute_notify_hhmm(training_time_hhmm: str) -> str | None:
    """Return notify time = training_time + 3h, or None if result > 20:30 or >= 24:00."""
    try:
        h, m = map(int, training_time_hhmm.split(":"))
    except (ValueError, AttributeError):
        return None
    total_minutes = h * 60 + m + 3 * 60
    notify_h, notify_m = divmod(total_minutes, 60)
    if notify_h >= 24 or total_minutes > 20 * 60 + 30:
        return None
    return f"{notify_h:02d}:{notify_m:02d}"


async def _today_tracker_sum(session, user_id: int, tracker_type: TrackerType) -> float:
    """Return the sum of tracker values for the given type logged today (UTC day).
    Returns 0.0 if no records exist."""
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    result = await session.scalar(
        select(func.sum(Tracker.value)).where(
            and_(
                Tracker.user_id == user_id,
                Tracker.type == tracker_type,
                Tracker.created_at >= today_start,
            )
        )
    )
    return float(result) if result is not None else 0.0



def _user_local_time(tz_str: str | None) -> datetime:
    """Return current datetime in user's UTC-offset timezone (e.g. 'UTC+3')."""
    tz_str = (tz_str or "UTC+3").strip()
    try:
        if tz_str.startswith("UTC"):
            rest = tz_str[3:]  # "+3", "-5", "+10", "" (UTC)
            if not rest:
                offset_hours = 0.0
            else:
                offset_hours = float(rest)
        else:
            # Fallback: try pytz name
            user_tz = pytz.timezone(tz_str)
            return datetime.now(timezone.utc).astimezone(user_tz)
        user_tz = timezone(timedelta(hours=offset_hours))
    except Exception:
        user_tz = timezone(timedelta(hours=3))  # МСК fallback
    return datetime.now(user_tz)


async def check_reminders(bot: Bot) -> None:
    """
    Runs every minute.
    For each active user, compare their local HH:MM against
    morning_reminder_time and evening_reminder_time.
    Sends the appropriate reminder if not already sent today.
    """
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(User, Profile)
            .outerjoin(Profile, Profile.user_id == User.id)
            .where(User.is_active == True)
        )).all()

    for user, profile in rows:
        try:
            # Skip if user turned off notifications
            if profile and not profile.notifications_enabled:
                continue

            now_local = _user_local_time(profile.timezone if profile else None)
            hhmm = now_local.strftime("%H:%M")

            morning_time = (profile.morning_reminder_time if profile and profile.morning_reminder_time
                            else (profile.push_time if profile and profile.push_time else "08:00"))
            evening_time = (profile.evening_reminder_time if profile and profile.evening_reminder_time
                            else "21:00")

            # ── Morning ──────────────────────────────────────────────
            if hhmm == morning_time:
                key = (user.id, "morning")
                if _reminder_sent.get(key) != today:
                    async with AsyncSessionLocal() as s:
                        already = await _has_morning_checkin_today(s, user.id)
                    if not already:
                        await bot.send_message(
                            chat_id=user.telegram_id,
                            text="Доброе утро! 🌅 Время утреннего чекина — как ты сегодня?",
                            reply_markup=_webapp_kb(),
                        )
                    _reminder_sent[key] = today

            # ── Evening ──────────────────────────────────────────────
            if hhmm == evening_time:
                key = (user.id, "evening")
                if _reminder_sent.get(key) != today:
                    await bot.send_message(
                        chat_id=user.telegram_id,
                        text="Время вечернего чекина. Как прошёл день? 🌙",
                        reply_markup=_webapp_kb(),
                    )
                    _reminder_sent[key] = today

            # ── Water top-up at 16:00 ─────────────────────────────────
            if hhmm == "16:00":
                key = (user.id, "water_topup")
                if _reminder_sent.get(key) != today:
                    async with AsyncSessionLocal() as s:
                        water_today = await _today_tracker_sum(s, user.id, TrackerType.water)
                    if water_today < 1000:  # < 50 % от цели 2000 мл
                        tone = (profile.tone if profile and profile.tone else "soft")
                        if tone == "aggressive":
                            text = "Воды сегодня мало. Добери норму — это базовая дисциплина."
                        else:
                            text = (
                                "Не забывай про воду 💧 За день выпито меньше половины нормы — "
                                "сделай пару глотков, организму это важно."
                            )
                        await bot.send_message(
                            chat_id=user.telegram_id,
                            text=text,
                            reply_markup=_webapp_kb(),
                        )
                    _reminder_sent[key] = today

            # ── Calorie checks at 20:00 (under-eating + over-limit) ────────────
            if hhmm == "20:00":
                key_topup = (user.id, "calories_topup")
                key_over  = (user.id, "calories_over")
                need_topup = _reminder_sent.get(key_topup) != today
                need_over  = _reminder_sent.get(key_over)  != today

                if need_topup or need_over:
                    async with AsyncSessionLocal() as s:
                        cal_today = await _today_tracker_sum(s, user.id, TrackerType.calories)
                    cal_limit = calculate_calorie_limit(profile)
                    tone = (profile.tone if profile and profile.tone else "soft")

                    if cal_today > 0:  # пушим только если хоть что-то внесено
                        if need_topup and cal_today < cal_limit * 0.70:
                            if tone == "aggressive":
                                text = (
                                    "Калорий сегодня недобор. "
                                    "Без топлива нет роста — добери норму."
                                )
                            else:
                                text = (
                                    "Сегодня ты ел заметно меньше нормы. "
                                    "Для твоей цели важно добрать — недоедание тормозит результат 💛"
                                )
                            await bot.send_message(
                                chat_id=user.telegram_id,
                                text=text,
                                reply_markup=_webapp_kb(),
                            )

                        if need_over and cal_today > cal_limit:
                            if tone == "aggressive":
                                text = (
                                    "Сегодня превысил норму по калориям. "
                                    "Бывает — глянь с ассистентом, что подкрутить."
                                )
                            else:
                                text = (
                                    "Сегодня калорий вышло больше дневной нормы. "
                                    "Это нормально время от времени — если хочешь, "
                                    "обсуди с ассистентом, как скорректировать 💛"
                                )
                            await bot.send_message(
                                chat_id=user.telegram_id,
                                text=text,
                                reply_markup=_webapp_kb(),
                            )

                    _reminder_sent[key_topup] = today
                    _reminder_sent[key_over]  = today

            # ── Post-workout reminder (training_time + 3h) ───────────────────────
            # Rescanner approach: no persistent jobs needed, survives restarts.
            # Cache prevents repeated DB reads; 15-min grace window handles
            # the case where the bot was restarted around the notify time.
            key_tw = (user.id, "training_checkin")
            if _reminder_sent.get(key_tw) != today:
                cached = _training_notify_cache.get(user.id)
                if cached is None or cached[1] != today:
                    async with AsyncSessionLocal() as s:
                        is_training, raw_time = await _get_morning_training_time(s, user.id)
                    target_hhmm = _compute_notify_hhmm(raw_time) if (is_training and raw_time) else None
                    _training_notify_cache[user.id] = (target_hhmm, today)
                    cached = (target_hhmm, today)

                target_hhmm = cached[0]
                if target_hhmm:
                    now_total = now_local.hour * 60 + now_local.minute
                    t_h, t_m = map(int, target_hhmm.split(":"))
                    target_total = t_h * 60 + t_m
                    # 15-minute grace window: send if we're at or up to 15 min past target
                    if 0 <= now_total - target_total <= 15:
                        async with AsyncSessionLocal() as s:
                            already_done = await _has_post_workout_today(s, user.id)
                        if not already_done:
                            await bot.send_message(
                                chat_id=user.telegram_id,
                                text=(
                                    "Как прошла тренировка? "
                                    "Отметь, как всё прошло — это займёт минуту 💪"
                                ),
                                reply_markup=_webapp_kb(),
                            )
                        _reminder_sent[key_tw] = today

        except Exception as exc:
            logger.warning("check_reminders failed for user %s: %s", user.telegram_id, exc)

    # Clean up stale entries (older than today)
    stale = [k for k, d in _reminder_sent.items() if d < today]
    for k in stale:
        del _reminder_sent[k]
    stale_cache = [uid for uid, (_, d) in _training_notify_cache.items() if d < today]
    for uid in stale_cache:
        del _training_notify_cache[uid]


async def check_upgrade_reminders(bot: Bot) -> None:
    """
    Every 6 hours: send up to 2 follow-up messages to users who clicked UPGRADE
    but haven't subscribed yet.
      - Reminder 1: 24h after click  (remind_count == 0)
      - Reminder 2: 3 days after 1st (remind_count == 1)
    """
    pro_url = settings.GETCOURSE_PRO_URL or settings.GC_PAYMENT_URL_PRO
    if not pro_url:
        return  # nowhere to send them

    now = datetime.now(timezone.utc)

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(UpgradeIntent, User)
            .join(User, UpgradeIntent.user_id == User.id)
            .where(UpgradeIntent.remind_count < 2)
        )
        rows = result.all()

    for intent, user in rows:
        # Skip users who already have an active subscription
        if user.subscription_active == "active" and user.subscription_type:
            continue

        try:
            if intent.remind_count == 0:
                # First reminder: 24h after click
                delta = now - intent.clicked_at.replace(tzinfo=timezone.utc)
                if delta < timedelta(hours=24):
                    continue
                text = (
                    "Ты смотрел тариф Pro 👀\n\n"
                    "Чат резидентов и база знаний уже ждут.\n"
                    "Осталось только оплатить 💪"
                )
                kb = _url_kb("ОПЛАТИТЬ PRO →", pro_url)

            elif intent.remind_count == 1 and intent.reminded_at:
                # Second reminder: 3 days after first
                delta = now - intent.reminded_at.replace(tzinfo=timezone.utc)
                if delta < timedelta(days=3):
                    continue
                text = (
                    "Привет! Просто хотели убедиться, что у тебя есть вся информация о тарифе Pro.\n\n"
                    "В него входит закрытый чат резидентов — живое сообщество людей с похожими целями, "
                    "и полная база знаний клуба: программы, нутрициология, записи эфиров.\n\n"
                    "Если будут вопросы — напиши нам, поможем разобраться 🙌"
                )
                kb = _url_kb("ПОДРОБНЕЕ О ТАРИФЕ PRO →", pro_url)

            else:
                continue

            await bot.send_message(chat_id=user.telegram_id, text=text, reply_markup=kb)
            logger.info("Upgrade reminder #%d sent to user %s", intent.remind_count + 1, user.telegram_id)

            # Update intent record
            async with AsyncSessionLocal() as session:
                fresh = await session.get(UpgradeIntent, intent.id)
                if fresh:
                    fresh.reminded_at = now
                    fresh.remind_count += 1
                    await session.commit()

        except Exception as exc:
            logger.warning("Upgrade reminder failed for user %s: %s", user.telegram_id, exc)


_GOAL_DISPLAY = {
    "weight_loss": "Похудение",
    "muscle_gain": "Набор мышц",
    "maintenance": "Поддержание",
    "endurance":   "Выносливость",
}


async def sync_progress_to_getcourse() -> None:
    """
    Daily at 03:00 Moscow: compute 30-day stats for every active user with an email
    and push them as extra-field updates to GetCourse.
    """
    if not settings.GC_API_KEY or not settings.GC_ACCOUNT:
        return  # GC not configured

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=30)

    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(User, Profile)
            .join(Profile, Profile.user_id == User.id)
            .where(
                User.is_active == True,
                User.email.isnot(None),
                User.email != "",
            )
        )).all()

    logger.info("GC progress sync: processing %d users", len(rows))

    for user, profile in rows:
        try:
            async with AsyncSessionLocal() as session:
                # ── Checkins in last 30 days ───────────────────────────────
                checkin_count = (await session.scalar(
                    select(func.count()).select_from(Checkin).where(
                        Checkin.user_id == user.id,
                        Checkin.created_at >= cutoff,
                    )
                )) or 0

                # Discipline = checkins / 90 (3 per day × 30 days) * 100 %
                discipline = round(min(checkin_count / 90 * 100, 100))

                # ── Last checkin date ──────────────────────────────────────
                last_checkin_row = (await session.execute(
                    select(Checkin.created_at)
                    .where(Checkin.user_id == user.id)
                    .order_by(Checkin.created_at.desc())
                    .limit(1)
                )).scalar_one_or_none()

                # ── Tracker averages ───────────────────────────────────────
                async def _avg(tracker_type: TrackerType) -> float | None:
                    val = await session.scalar(
                        select(func.avg(Tracker.value)).where(
                            Tracker.user_id == user.id,
                            Tracker.type == tracker_type,
                            Tracker.created_at >= cutoff,
                        )
                    )
                    return round(float(val), 1) if val is not None else None

                avg_weight = await _avg(TrackerType.weight)
                avg_sleep  = await _avg(TrackerType.sleep)
                avg_water  = await _avg(TrackerType.water)

            # ── Build addfields dict (only include keys that are configured) ──
            goals = profile.goals or ([profile.goal.value] if profile.goal else [])
            goal_display = ", ".join(_GOAL_DISPLAY.get(g, g) for g in goals) if goals else ""

            addfields: dict[str, str] = {}

            def _set(field_key: str, value: str) -> None:
                if field_key:
                    addfields[field_key] = value

            _set(settings.GC_FIELD_DISCIPLINE,   f"{discipline}%")
            _set(settings.GC_FIELD_CHECKINS,     f"{checkin_count} из 90")
            _set(settings.GC_FIELD_WEIGHT,        str(avg_weight) if avg_weight is not None else "")
            _set(settings.GC_FIELD_SLEEP,         str(avg_sleep)  if avg_sleep  is not None else "")
            _set(settings.GC_FIELD_WATER,         str(avg_water)  if avg_water  is not None else "")
            _set(settings.GC_FIELD_LAST_CHECKIN,
                 last_checkin_row.strftime("%d.%m.%Y") if last_checkin_row else "")
            _set(settings.GC_FIELD_GOAL,          goal_display)
            _set(settings.GC_FIELD_SUBSCRIPTION,  user.subscription_type or "")
            _set(settings.GC_FIELD_USERNAME,
                 f"@{user.username}" if user.username else "")

            if not addfields:
                continue  # no fields configured — nothing to send

            await sync_progress_to_gc(email=user.email, addfields=addfields)
            logger.debug("GC progress synced for user %s", user.telegram_id)

        except Exception as exc:
            logger.warning("GC progress sync failed for user %s: %s", user.telegram_id, exc)


def setup_scheduler(bot: Bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=MOSCOW)

    # Per-minute check: sends morning/evening reminders based on each user's local time
    scheduler.add_job(
        check_reminders,
        IntervalTrigger(minutes=1),
        args=[bot],
        id="check_reminders",
    )
    scheduler.add_job(
        check_upgrade_reminders,
        CronTrigger(hour="*/6", minute=0, timezone=MOSCOW),
        args=[bot],
        id="upgrade_reminders",
    )

    # Daily GetCourse progress sync at 03:00 Moscow
    scheduler.add_job(
        sync_progress_to_getcourse,
        CronTrigger(hour=3, minute=0, timezone=MOSCOW),
        id="gc_progress_sync",
    )

    return scheduler
