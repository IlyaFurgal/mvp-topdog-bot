import logging

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import MenuButtonWebApp, WebAppInfo
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

from bot.handlers import menu, registration
from bot.scheduler import setup_scheduler
from core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

WEBHOOK_PATH = "/webhook/bot"
WEBHOOK_URL = f"{settings.MINI_APP_URL.rstrip('/')}{WEBHOOK_PATH}"

bot = Bot(token=settings.BOT_TOKEN)
dp = Dispatcher(storage=MemoryStorage())

dp.include_router(registration.router)
dp.include_router(menu.router)


async def on_startup(app: web.Application) -> None:
    await bot.set_webhook(url=WEBHOOK_URL, drop_pending_updates=True)
    logger.info("Webhook set: %s", WEBHOOK_URL)

    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="Открыть MVP",
            web_app=WebAppInfo(url=settings.MINI_APP_URL),
        )
    )
    logger.info("Menu button set: %s", settings.MINI_APP_URL)

    scheduler = setup_scheduler(bot)
    scheduler.start()
    logger.info("Scheduler started")
    app["scheduler"] = scheduler


async def on_shutdown(app: web.Application) -> None:
    scheduler = app.get("scheduler")
    if scheduler:
        scheduler.shutdown()
    await bot.delete_webhook()
    logger.info("Webhook deleted")


def main() -> None:
    app = web.Application()

    SimpleRequestHandler(dispatcher=dp, bot=bot).register(app, path=WEBHOOK_PATH)
    setup_application(app, dp, bot=bot)

    app.on_startup.append(on_startup)
    app.on_shutdown.append(on_shutdown)

    logger.info("Starting webhook server on 0.0.0.0:8080 ...")
    web.run_app(app, host="0.0.0.0", port=8080)


if __name__ == "__main__":
    main()
