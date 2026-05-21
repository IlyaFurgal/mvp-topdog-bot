import logging
from datetime import date, datetime, timedelta, timezone

import pytz
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import and_, select

from core.config import settings
from database.models import Checkin, CheckinType, Profile, UpgradeIntent, User
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
MOSCOW = pytz.timezone("Europe/Moscow")

# ── In-memory dedup: user_id → date of last morning push sent ────────────────
# Prevents duplicate sends if the per-minute job overlaps midnight or restarts.
_morning_sent: dict[int, date] = {}


def _webapp_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="Открыть приложение",
            web_app=WebAppInfo(url=settings.MINI_APP_URL),
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


async def _get_active_users_without_checkin(checkin_type: CheckinType) -> list[User]:
    today_start = datetime.combine(date.today(), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    async with AsyncSessionLocal() as session:
        users_result = await session.execute(
            select(User).where(User.is_active == True)
        )
        users = users_result.scalars().all()

        result = []
        for user in users:
            done = await session.execute(
                select(Checkin).where(
                    and_(
                        Checkin.user_id == user.id,
                        Checkin.type == checkin_type,
                        Checkin.created_at >= today_start,
                    )
                )
            )
            if not done.scalar_one_or_none():
                result.append(user)
        return result


# ── Personal push-time morning reminders (runs every minute) ─────────────────

async def send_personal_morning_reminders(bot: Bot) -> None:
    """
    For each active user who has a push_time set, check if their local time
    matches push_time right now (within this minute). Send morning reminder
    if not already sent today and no morning checkin exists yet.
    """
    now_utc = datetime.now(timezone.utc)
    today = now_utc.date()

    async with AsyncSessionLocal() as session:
        # Join User ↔ Profile to get users with push_time set
        rows = (await session.execute(
            select(User, Profile)
            .join(Profile, Profile.user_id == User.id)
            .where(
                User.is_active == True,
                Profile.push_time.isnot(None),
                Profile.push_time != "",
            )
        )).all()

    for user, profile in rows:
        try:
            # Determine user's local time
            tz_name = profile.timezone or "Europe/Moscow"
            try:
                user_tz = pytz.timezone(tz_name)
            except pytz.exceptions.UnknownTimeZoneError:
                user_tz = MOSCOW

            now_local = now_utc.astimezone(user_tz)
            local_hhmm = now_local.strftime("%H:%M")

            if local_hhmm != profile.push_time:
                continue

            # Dedup: already sent today?
            if _morning_sent.get(user.id) == today:
                continue

            # Also check if user already has a morning checkin
            async with AsyncSessionLocal() as session:
                if await _has_morning_checkin_today(session, user.id):
                    _morning_sent[user.id] = today
                    continue

            await bot.send_message(
                chat_id=user.telegram_id,
                text="Доброе утро! 🌅 Время утреннего чекина — как ты сегодня?",
                reply_markup=_webapp_kb(),
            )
            _morning_sent[user.id] = today
            logger.info("Personal morning push sent to user %s at %s", user.telegram_id, local_hhmm)

        except Exception as exc:
            logger.warning("Personal morning push failed for user %s: %s", user.telegram_id, exc)

    # Clean up old entries from _morning_sent (keep only today's)
    stale = [uid for uid, d in _morning_sent.items() if d < today]
    for uid in stale:
        del _morning_sent[uid]


# ── Fallback broadcast reminders (for users without personal push_time) ───────

async def send_morning_reminders(bot: Bot) -> None:
    """Broadcast morning reminder at 08:00 Moscow for users without push_time."""
    async with AsyncSessionLocal() as session:
        rows = (await session.execute(
            select(User)
            .outerjoin(Profile, Profile.user_id == User.id)
            .where(
                User.is_active == True,
                (Profile.push_time == None) | (Profile.push_time == ""),
            )
        )).scalars().all()

    today_start = datetime.combine(date.today(), datetime.min.time()).replace(
        tzinfo=timezone.utc
    )
    to_notify = []
    async with AsyncSessionLocal() as session:
        for user in rows:
            done = await session.execute(
                select(Checkin).where(
                    and_(
                        Checkin.user_id == user.id,
                        Checkin.type == CheckinType.morning,
                        Checkin.created_at >= today_start,
                    )
                )
            )
            if not done.scalar_one_or_none():
                to_notify.append(user)

    logger.info("Broadcast morning reminders: %d users to notify", len(to_notify))
    for user in to_notify:
        try:
            await bot.send_message(
                chat_id=user.telegram_id,
                text="Доброе утро! Время утреннего чекина.",
                reply_markup=_webapp_kb(),
            )
        except Exception as e:
            logger.warning("Failed to notify user %s: %s", user.telegram_id, e)


async def send_evening_reminders(bot: Bot) -> None:
    users = await _get_active_users_without_checkin(CheckinType.evening)
    logger.info("Evening reminders: %d users to notify", len(users))
    for user in users:
        try:
            await bot.send_message(
                chat_id=user.telegram_id,
                text="Время вечернего чекина. Как прошёл день?",
                reply_markup=_webapp_kb(),
            )
        except Exception as e:
            logger.warning("Failed to notify user %s: %s", user.telegram_id, e)


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


def setup_scheduler(bot: Bot) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone=MOSCOW)

    # Personal push: every minute — checks each user's local HH:MM vs their push_time
    scheduler.add_job(
        send_personal_morning_reminders,
        IntervalTrigger(minutes=1),
        args=[bot],
        id="personal_morning_reminders",
    )

    # Fallback broadcast: 08:00 Moscow for users without a personal push_time
    scheduler.add_job(
        send_morning_reminders,
        CronTrigger(hour=8, minute=0, timezone=MOSCOW),
        args=[bot],
        id="morning_reminders",
    )

    scheduler.add_job(
        send_evening_reminders,
        CronTrigger(hour=21, minute=0, timezone=MOSCOW),
        args=[bot],
        id="evening_reminders",
    )
    scheduler.add_job(
        check_upgrade_reminders,
        CronTrigger(hour="*/6", minute=0, timezone=MOSCOW),
        args=[bot],
        id="upgrade_reminders",
    )

    return scheduler
