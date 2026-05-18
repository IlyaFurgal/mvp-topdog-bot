import logging
from datetime import date, datetime, timezone

import pytz
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import and_, select

from core.config import settings
from database.models import Checkin, CheckinType, User
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
MOSCOW = pytz.timezone("Europe/Moscow")


def _webapp_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🚀 Открыть приложение",
            web_app=WebAppInfo(url=settings.MINI_APP_URL),
        )
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
                text="🌅 Доброе утро! Время утреннего чекина.",
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
                text="🌙 Время вечернего чекина. Как прошёл день?",
                reply_markup=_webapp_kb(),
            )
        except Exception as e:
            logger.warning("Failed to notify user %s: %s", user.telegram_id, e)


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

    return scheduler
