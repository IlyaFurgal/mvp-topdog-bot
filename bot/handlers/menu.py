import logging

from aiogram import F, Router
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from bot.keyboards.reply import freemium_menu_kb, main_menu_kb
from core.config import settings
from database.crud import get_user_by_telegram_id
from database.models import SubscriptionStatus
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
    if settings.GC_PAYMENT_URL_PLUS:
        buttons.append([InlineKeyboardButton(text="💡 Тариф Plus — до 1 000 ₽/мес", url=settings.GC_PAYMENT_URL_PLUS)])
    if settings.GC_PAYMENT_URL_PRO:
        buttons.append([InlineKeyboardButton(text="🏆 Тариф Pro — 2 990 ₽/мес", url=settings.GC_PAYMENT_URL_PRO)])
    if not buttons:
        buttons = [[InlineKeyboardButton(text="📩 Написать менеджеру", url=settings.SUPPORT_TG_URL)]]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


def _user_has_subscription(user) -> bool:
    """
    Return True if the user has an active paid subscription.

    Checks two independent signals so that manually set or webhook-set
    subscriptions are both recognised:
      1. subscription_active == "active"  (set by GC webhook)
      2. subscription_status == premium   (legacy / manual flag)
    """
    by_active = (
        user.subscription_active == "active"
        and user.subscription_type is not None
    )
    by_status = user.subscription_status == SubscriptionStatus.premium
    has = by_active or by_status
    logger.debug(
        "sub check uid=%s type=%r active=%r status=%r → %s",
        user.telegram_id,
        user.subscription_type,
        user.subscription_active,
        user.subscription_status,
        has,
    )
    return has


async def _has_subscription(telegram_id: int) -> bool:
    """Async wrapper used by menu handlers."""
    async with AsyncSessionLocal() as session:
        user = await get_user_by_telegram_id(session, telegram_id)
        if not user:
            return False
        return _user_has_subscription(user)


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
        "💡 *Plus* — до 1 000 ₽/мес\n"
        "  • ИИ-ассистент (тренер, нутрициолог, здоровье, фокус)\n"
        "  • Чекины и трекеры\n\n"
        "🏆 *Pro* — 2 990 ₽/мес\n"
        "  • Всё из Plus\n"
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
