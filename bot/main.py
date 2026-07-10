import logging
import os

from aiohttp import web
from aiogram import Bot, Dispatcher
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.client.telegram import TelegramAPIServer
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import MenuButtonWebApp, WebAppInfo
from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application

from bot.handlers import menu, registration
from bot.scheduler import setup_scheduler
from core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

WEBHOOK_PATH = "/webhook/bot"

bot = Bot(
    token=settings.BOT_TOKEN,
    session=AiohttpSession(
        api=TelegramAPIServer.from_base(
            os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org")
        )
    ),
)
dp = Dispatcher(storage=MemoryStorage())

dp.include_router(registration.router)
dp.include_router(menu.router)


async def on_startup(app: web.Application) -> None:
    # Webhook registration is done manually from the host with curl,
    # because the Docker network blocks outgoing connections to api.telegram.org.
    # We still try here in case networking is fixed later — errors are non-fatal.
    webhook_url = f"{settings.MINI_APP_URL.rstrip('/')}{WEBHOOK_PATH}"
    try:
        await bot.set_webhook(url=webhook_url, drop_pending_updates=True)
        logger.info("Webhook set: %s", webhook_url)
    except Exception as e:
        logger.warning(
            "Could not register webhook automatically (outgoing blocked?): %s. "
            "Register manually: curl 'https://api.telegram.org/bot%s/setWebhook"
            "?url=%s'",
            e, settings.BOT_TOKEN, webhook_url,
        )

    try:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(
                text="Открыть MVP",
                web_app=WebAppInfo(url=settings.mini_app_url_versioned),
            )
        )
        logger.info("Menu button set")
    except Exception as e:
        logger.warning("Could not set menu button: %s", e)

    if settings.SCHEDULER_ENABLED:
        scheduler = setup_scheduler(bot)
        scheduler.start()
        logger.info("Scheduler started")
        app["scheduler"] = scheduler
    else:
        logger.warning("Scheduler DISABLED via SCHEDULER_ENABLED=false — no pushes will be sent")


async def on_shutdown(app: web.Application) -> None:
    scheduler = app.get("scheduler")
    if scheduler:
        scheduler.shutdown()
    try:
        await bot.delete_webhook()
    except Exception:
        pass
    logger.info("Bot shutdown complete")


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
