import logging
from datetime import date, datetime, timedelta, timezone

import pytz
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import and_, select

from core.config import settings
from database.models import Checkin, CheckinType, UpgradeIntent, User
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
MOSCOW = pytz.timezone("Europe/Moscow")


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


async def send_morning_reminders(bot: Bot) -> None:
    users = await _get_active_users_without_checkin(CheckinType.morning)
    logger.info("Morning reminders: %d users to notify", len(users))
    for user in users:
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
    mvp_url = settings.GETCOURSE_MVP_URL or settings.GC_PAYMENT_URL_MVP
    if not mvp_url:
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
                    "Ты смотрел тариф MVP 👀\n\n"
                    "Чат резидентов и база знаний уже ждут.\n"
                    "Осталось только оплатить 💪"
                )
                kb = _url_kb("ОПЛАТИТЬ MVP →", mvp_url)

            elif intent.remind_count == 1 and intent.reminded_at:
                # Second reminder: 3 days after first
                delta = now - intent.reminded_at.replace(tzinfo=timezone.utc)
                if delta < timedelta(days=3):
                    continue
                text = (
                    "Привет! Просто хотели убедиться, что у тебя есть вся информация о тарифе MVP.\n\n"
                    "В него входит закрытый чат резидентов — живое сообщество людей с похожими целями, "
                    "и полная база знаний клуба: программы, нутрициология, записи эфиров.\n\n"
                    "Если будут вопросы — напиши нам, поможем разобраться 🙌"
                )
                kb = _url_kb("ПОДРОБНЕЕ О ТАРИФЕ MVP →", mvp_url)

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
