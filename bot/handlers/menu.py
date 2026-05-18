import logging

from aiogram import F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from bot.keyboards.reply import freemium_menu_kb, main_menu_kb
from core.config import settings
from database.crud import get_user_by_telegram_id
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
router = Router()


def _webapp_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="🚀 Открыть приложение",
            web_app=WebAppInfo(url=settings.MINI_APP_URL),
        )
    ]])


def _plans_kb() -> InlineKeyboardMarkup:
    """Inline keyboard with payment links for the two plans."""
    buttons = []
    if settings.GC_PAYMENT_URL_AI:
        buttons.append([InlineKeyboardButton(text="💡 Тариф AI — до 1 000 ₽/мес", url=settings.GC_PAYMENT_URL_AI)])
    if settings.GC_PAYMENT_URL_MVP:
        buttons.append([InlineKeyboardButton(text="🏆 Тариф MVP — 2 990 ₽/мес", url=settings.GC_PAYMENT_URL_MVP)])
    if not buttons:
        buttons = [[InlineKeyboardButton(text="📩 Написать менеджеру", url=settings.SUPPORT_TG_URL)]]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def _has_subscription(telegram_id: int) -> bool:
    """Check if the user has an active subscription."""
    async with AsyncSessionLocal() as session:
        user = await get_user_by_telegram_id(session, telegram_id)
        if not user:
            return False
        return user.subscription_active == "active" and user.subscription_type is not None


# ── Freemium handlers ──────────────────────────────────────────────────────────

@router.message(F.text == "📋 О клубе")
async def menu_about(message: Message) -> None:
    await message.answer(
        "🏆 *MVP by TopDog* — клуб для тех, кто работает над собой.\n\n"
        "Внутри:\n"
        "• ИИ-тренер и нутрициолог 24/7\n"
        "• Ежедневные чекины и трекеры\n"
        "• Сообщество резидентов\n"
        "• База знаний и закрытые эфиры\n\n"
        "Выбери тариф и начни 👇",
        parse_mode="Markdown",
        reply_markup=_plans_kb(),
    )


@router.message(F.text == "💳 Выбрать тариф")
async def menu_plans(message: Message) -> None:
    text = (
        "📦 *Наши тарифы:*\n\n"
        "💡 *AI* — до 1 000 ₽/мес\n"
        "  • ИИ-ассистент (тренер, нутрициолог, здоровье, фокус)\n"
        "  • Чекины и трекеры\n\n"
        "🏆 *MVP* — 2 990 ₽/мес\n"
        "  • Всё из AI\n"
        "  • Доступ в Telegram-группу резидентов\n"
        "  • База знаний и эфиры на GetCourse\n"
        "  • Офлайн-активности и мероприятия\n"
    )
    await message.answer(text, parse_mode="Markdown", reply_markup=_plans_kb())


@router.message(F.text == "❓ Поддержка")
async def menu_support(message: Message) -> None:
    kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="💬 Написать в поддержку", url=settings.SUPPORT_TG_URL)
    ]])
    await message.answer("Напиши нам — ответим в течение нескольких часов 👇", reply_markup=kb)


# ── Main menu handlers (for subscribed users) ─────────────────────────────────

@router.message(F.text == "🤖 ИИ-ассистент")
async def menu_ai(message: Message) -> None:
    if not await _has_subscription(message.from_user.id):
        await message.answer("Оформи подписку для доступа к ИИ-ассистенту 👇", reply_markup=_plans_kb())
        return
    await message.answer("🤖 ИИ-ассистент — в разработке.")


@router.message(F.text == "📊 Мой прогресс")
async def menu_progress(message: Message) -> None:
    if not await _has_subscription(message.from_user.id):
        await message.answer("Оформи подписку для доступа 👇", reply_markup=_plans_kb())
        return
    await message.answer("📊 Открой приложение для просмотра прогресса.", reply_markup=_webapp_kb())


@router.message(F.text == "✅ Чекин")
async def menu_checkin(message: Message) -> None:
    if not await _has_subscription(message.from_user.id):
        await message.answer("Оформи подписку для доступа 👇", reply_markup=_plans_kb())
        return
    await message.answer("✅ Открой приложение для чекина.", reply_markup=_webapp_kb())


@router.message(F.text == "👤 Мой профиль")
async def menu_profile(message: Message) -> None:
    if not await _has_subscription(message.from_user.id):
        await message.answer("Оформи подписку для доступа 👇", reply_markup=_plans_kb())
        return
    await message.answer("👤 Профиль — в разработке.")


@router.message(F.text == "⚙️ Настройки")
async def menu_settings(message: Message) -> None:
    if not await _has_subscription(message.from_user.id):
        await message.answer("Оформи подписку для доступа 👇", reply_markup=_plans_kb())
        return
    await message.answer("⚙️ Настройки", reply_markup=_webapp_kb())
