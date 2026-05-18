import asyncio
import logging

from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import MenuButtonWebApp, WebAppInfo

from bot.handlers import menu, registration
from bot.scheduler import setup_scheduler
from core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def set_menu_button(bot: Bot) -> None:
    """Set the persistent menu button that opens the Mini App for all users."""
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Открыть MVP",
            web_app=WebAppInfo(url=settings.MINI_APP_URL),
        )
    )
    logger.info("Menu button set to Mini App: %s", settings.MINI_APP_URL)


async def main() -> None:
    bot = Bot(token=settings.BOT_TOKEN)
    dp = Dispatcher(storage=MemoryStorage())

    dp.include_router(registration.router)
    dp.include_router(menu.router)

    await set_menu_button(bot)

    scheduler = setup_scheduler(bot)
    scheduler.start()
    logger.info("Scheduler started")

    logger.info("Starting bot in polling mode...")
    try:
        await dp.start_polling(bot)
    finally:
        scheduler.shutdown()


if __name__ == "__main__":
    asyncio.run(main())
