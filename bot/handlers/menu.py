import logging

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message, WebAppInfo

from bot.funnel_content import (
    ABOUT_CLUB_TEXT, FAQ_TEXT, SUPPORT_TEXT, TARIFFS_TEXT,
    about_club_kb, faq_kb, support_kb, tariffs_kb,
)
from bot.keyboards.reply import freemium_menu_kb, main_menu_kb, request_contact_kb
from bot.services.push_media import send_push_video
from bot.states import RegistrationForm
from core.config import settings
from database.crud import get_user_by_telegram_id
from database.models import SubscriptionStatus
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
router = Router()


def _webapp_kb(text: str = "🚀 Открыть приложение") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=text,
            web_app=WebAppInfo(url=settings.mini_app_url_versioned),
        )
    ]])


def _plans_kb(tg_id: int | None = None) -> InlineKeyboardMarkup:
    """Payment-link keyboard for the two plans.

    Thin wrapper around funnel_content.tariffs_kb — single source of truth
    for the URL-building logic (tg_id relay + UTM params), kept under this
    name since registration.py and several handlers below already import
    it as `_plans_kb`.
    """
    return tariffs_kb(tg_id)


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
    await send_push_video(message.bot, message.chat.id, "about_club")
    await message.answer(ABOUT_CLUB_TEXT, reply_markup=about_club_kb())


@router.callback_query(F.data == "show_tariffs")
async def cb_show_tariffs(callback: CallbackQuery) -> None:
    await callback.message.answer(TARIFFS_TEXT, reply_markup=tariffs_kb(callback.from_user.id), parse_mode="Markdown")
    await callback.answer()


@router.message(F.text == "💳 Выбрать тариф")
async def menu_plans(message: Message) -> None:
    await message.answer(TARIFFS_TEXT, reply_markup=tariffs_kb(message.from_user.id), parse_mode="Markdown")


@router.message(F.text == "✅ Я оплатил / Проверить доступ")
async def menu_check_payment(message: Message, state: FSMContext) -> None:
    await state.set_state(RegistrationForm.phone_check)
    await message.answer(
        "Поделись номером телефона, который указывал при оплате — "
        "бот сверится с базой и сразу откроет доступ 👇",
        reply_markup=request_contact_kb(),
    )


@router.message(F.text == "❓ Поддержка")
async def menu_support(message: Message) -> None:
    await message.answer(SUPPORT_TEXT, reply_markup=support_kb())


@router.message(F.text == "📖 FAQ")
async def menu_faq(message: Message) -> None:
    await message.answer(FAQ_TEXT, reply_markup=faq_kb(message.from_user.id))


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
