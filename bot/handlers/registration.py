import base64
import json
import logging
from datetime import date

import httpx
from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from bot.keyboards.inline import (
    kb_fitness, kb_gender, kb_goal, kb_health,
    kb_lifestyle, kb_sport, kb_start, kb_tone,
    kb_workout_days, kb_workout_hours,
)
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from bot.handlers.menu import _user_has_subscription, _webapp_kb
from bot.keyboards.reply import freemium_menu_kb, main_menu_kb
from bot.states import RegistrationForm
from core.config import settings
from database.crud import create_profile, create_user, get_user_by_telegram_id, update_user
from database.models import ActivityLevel, FitnessLevel, Gender, Goal, Profile, SubscriptionStatus, Tone, User
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

router = Router()

# ── Маппинги ──────────────────────────────────────────────────────────────────

_GOAL_MAP: dict[str, Goal] = {
    "muscle_gain": Goal.muscle_gain,
    "weight_loss":  Goal.weight_loss,
    "endurance":    Goal.endurance,
    "health":       Goal.maintenance,
    "stress":       Goal.maintenance,
    "overall":      Goal.maintenance,
}

_SPORT_LABELS: dict[str, str] = {
    "boxing":  "Бокс / единоборства",
    "gym":     "Фитнес / зал",
    "running": "Бег / кардио",
    "home":    "Домашние тренировки",
    "none":    "Не тренируюсь пока",
}

_FITNESS_MAP: dict[str, FitnessLevel] = {
    "beginner":     FitnessLevel.beginner,
    "intermediate": FitnessLevel.intermediate,
    "advanced":     FitnessLevel.advanced,
}

# дней в неделю → (число, activity_level)
_DAYS_MAP: dict[str, tuple[int, ActivityLevel]] = {
    "1_2":   (2, ActivityLevel.light),
    "3_4":   (4, ActivityLevel.moderate),
    "5_6":   (6, ActivityLevel.active),
    "every": (7, ActivityLevel.very_active),
}

# часов в день → репрезентативное число
_HOURS_MAP: dict[str, int] = {
    "lt1": 1,
    "1_2": 2,
    "2_3": 3,
    "gt3": 4,
}


# ── Хелпер: переход к вопросу о нагрузке ─────────────────────────────────────

async def _ask_workout(target: CallbackQuery | Message, state: FSMContext) -> None:
    data = await state.get_data()
    if data.get("fitness_level") == "advanced":
        await state.set_state(RegistrationForm.workout_hours)
        text = "Сколько часов в день ты тренируешься?"
        kb = kb_workout_hours()
    else:
        await state.set_state(RegistrationForm.workout_days)
        text = "Сколько дней в неделю ты тренируешься?"
        kb = kb_workout_days()

    if isinstance(target, CallbackQuery):
        await target.message.edit_text(text, reply_markup=kb)
        await target.answer()
    else:
        await target.answer(text, reply_markup=kb)


# ── /start ────────────────────────────────────────────────────────────────────

async def _register_in_getcourse(user: User, profile: Profile) -> None:
    """Send user data to GetCourse after registration. Silently skips if GC_API_KEY is empty."""
    if not settings.GC_API_KEY:
        return
    data = {
        "user": {
            "email": None,
            "first_name": user.first_name or "",
            "addfields": {
                "telegram_id": str(user.telegram_id),
                "goal": profile.goal.value if profile.goal else "",
                "sport_type": profile.sport_type or "",
                "fitness_level": profile.fitness_level.value if profile.fitness_level else "",
            },
            "group_name": ["Зарегистрированные в боте"],
        },
        "system": {
            "refresh_if_exists": 1,
            "secret_key": settings.GC_API_KEY,
        },
    }
    params_encoded = base64.b64encode(json.dumps(data, ensure_ascii=False).encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"https://{settings.GC_ACCOUNT}.getcourse.ru/pl/api/users",
                params={"params": params_encoded},
            )
            resp.raise_for_status()
            logger.info("GC registration: user %s sent to GC", user.telegram_id)
    except Exception as exc:
        logger.warning("GC registration failed for user %s: %s", user.telegram_id, exc)


@router.message(Command("start"))
async def cmd_start(message: Message, state: FSMContext) -> None:
    await state.clear()

    async with AsyncSessionLocal() as session:
        user = await get_user_by_telegram_id(session, message.from_user.id)
        if user:
            has_sub = _user_has_subscription(user)
            name = user.first_name or "друг"
            logger.info(
                "/start uid=%s has_sub=%s sub_type=%r sub_active=%r sub_status=%r",
                user.telegram_id,
                has_sub,
                user.subscription_type,
                user.subscription_active,
                user.subscription_status,
            )
            if has_sub:
                await message.answer(
                    f"Добро пожаловать обратно, {name}! 👊\n"
                    "Открой приложение 👇",
                    reply_markup=_webapp_kb(),
                )
            else:
                await message.answer(
                    f"Добро пожаловать обратно, {name}! 👊",
                    reply_markup=freemium_menu_kb(),
                )
            return
        await create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

    await state.set_state(RegistrationForm.greeting)
    await message.answer(
        "Привет! 👊\n\n"
        "Я твой персональный ассистент MVP by TopDog.\n"
        "Давай настроим твой профиль — это займёт 2 минуты.",
        reply_markup=kb_start(),
    )


# ── Шаг 0: приветствие → имя ──────────────────────────────────────────────────

@router.callback_query(RegistrationForm.greeting, F.data == "reg_start")
async def step_name(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(RegistrationForm.name_input)
    await callback.message.edit_text(
        "Как к тебе обращаться?\n\n"
        "Напиши имя или псевдоним 👇"
    )
    await callback.answer()


# ── Ввод имени → пол ──────────────────────────────────────────────────────────

@router.message(RegistrationForm.name_input)
async def step_gender(message: Message, state: FSMContext) -> None:
    name = (message.text or "").strip()
    if not name:
        await message.answer("Напиши, как к тебе обращаться 👇")
        return
    await state.update_data(preferred_name=name)
    await state.set_state(RegistrationForm.gender)
    await message.answer(f"Отлично, {name}! 💪\n\nТвой пол?", reply_markup=kb_gender())


# ── Пол → дата рождения ───────────────────────────────────────────────────────

@router.callback_query(RegistrationForm.gender, F.data.startswith("reg_gender_"))
async def step_birth_date(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(gender=callback.data.removeprefix("reg_gender_"))
    await state.set_state(RegistrationForm.birth_date_input)
    await callback.message.edit_text(
        "Введи дату рождения 🎂\n\n"
        "Форматы: 15.03.1995 или 15/03/1995"
    )
    await callback.answer()


# ── Ввод даты рождения → уровень подготовки ──────────────────────────────────

@router.message(RegistrationForm.birth_date_input)
async def step_fitness(message: Message, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace("/", ".")
    try:
        parts = raw.split(".")
        if len(parts) != 3:
            raise ValueError
        day, month, year = int(parts[0]), int(parts[1]), int(parts[2])
        birth = date(year, month, day)
        if birth >= date.today() or year < 1900:
            raise ValueError
    except (ValueError, IndexError):
        await message.answer(
            "⚠️ Не получилось распознать дату.\n"
            "Попробуй ещё раз: 15.03.1995 или 15/03/1995"
        )
        return

    await state.update_data(birth_date=birth.isoformat())
    await state.set_state(RegistrationForm.fitness_level)
    await message.answer("Какой у тебя уровень подготовки?", reply_markup=kb_fitness())


# ── Уровень подготовки → цель ─────────────────────────────────────────────────

@router.callback_query(RegistrationForm.fitness_level, F.data.startswith("reg_fitness_"))
async def step_goal(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(fitness_level=callback.data.removeprefix("reg_fitness_"))
    await state.set_state(RegistrationForm.goal)
    await callback.message.edit_text("Твоя главная цель?", reply_markup=kb_goal())
    await callback.answer()


# ── Цель → вид спорта ────────────────────────────────────────────────────────

@router.callback_query(RegistrationForm.goal, F.data.startswith("reg_goal_"))
async def step_sport(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(goal=callback.data.removeprefix("reg_goal_"))
    await state.set_state(RegistrationForm.sport_type)
    await callback.message.edit_text("Чем занимаешься?", reply_markup=kb_sport())
    await callback.answer()


# ── Вид спорта: готовый вариант → нагрузка ───────────────────────────────────

@router.callback_query(
    RegistrationForm.sport_type,
    F.data.startswith("reg_sport_") & ~F.data.endswith("_other"),
)
async def step_workout_from_sport(callback: CallbackQuery, state: FSMContext) -> None:
    sport_key = callback.data.removeprefix("reg_sport_")
    await state.update_data(sport_type=_SPORT_LABELS.get(sport_key, sport_key))
    await _ask_workout(callback, state)


# ── Вид спорта: "Другое" → текстовый ввод ────────────────────────────────────

@router.callback_query(RegistrationForm.sport_type, F.data == "reg_sport_other")
async def step_sport_custom(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(RegistrationForm.sport_custom)
    await callback.message.edit_text("Напиши свой вид спорта или активности:")
    await callback.answer()


@router.message(RegistrationForm.sport_custom)
async def step_workout_from_custom_sport(message: Message, state: FSMContext) -> None:
    sport_text = (message.text or "").strip()
    if not sport_text:
        await message.answer("Пожалуйста, напиши вид спорта текстом.")
        return
    await state.update_data(sport_type=sport_text)
    await _ask_workout(message, state)


# ── Часы в день (только продвинутые) → дни в неделю ─────────────────────────

@router.callback_query(RegistrationForm.workout_hours, F.data.startswith("reg_hours_"))
async def step_workout_days(callback: CallbackQuery, state: FSMContext) -> None:
    hours_key = callback.data.removeprefix("reg_hours_")
    await state.update_data(workout_hours=_HOURS_MAP.get(hours_key, 2))
    await state.set_state(RegistrationForm.workout_days)
    await callback.message.edit_text(
        "Сколько дней в неделю ты тренируешься?", reply_markup=kb_workout_days()
    )
    await callback.answer()


# ── Дни в неделю → образ жизни ───────────────────────────────────────────────

@router.callback_query(RegistrationForm.workout_days, F.data.startswith("reg_days_"))
async def step_lifestyle(callback: CallbackQuery, state: FSMContext) -> None:
    days_key = callback.data.removeprefix("reg_days_")
    days_val, activity_val = _DAYS_MAP.get(days_key, (3, ActivityLevel.moderate))
    await state.update_data(workout_days=days_val, activity_level=activity_val.value)
    await state.set_state(RegistrationForm.lifestyle)
    await callback.message.edit_text("Твой образ жизни?", reply_markup=kb_lifestyle())
    await callback.answer()


# ── Образ жизни → здоровье ───────────────────────────────────────────────────

@router.callback_query(RegistrationForm.lifestyle, F.data.startswith("reg_lifestyle_"))
async def step_health(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(lifestyle=callback.data.removeprefix("reg_lifestyle_"))
    await state.set_state(RegistrationForm.health_restrictions)
    await callback.message.edit_text(
        "Есть ли ограничения по здоровью?", reply_markup=kb_health()
    )
    await callback.answer()


# ── Здоровье: нет ограничений ────────────────────────────────────────────────

@router.callback_query(RegistrationForm.health_restrictions, F.data == "reg_health_none")
async def step_tone_no_health(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(health_restrictions=None)
    await state.set_state(RegistrationForm.tone)
    await callback.message.edit_text(
        "Как тебе комфортнее общаться?", reply_markup=kb_tone()
    )
    await callback.answer()


# ── Здоровье: есть ограничения → текст ───────────────────────────────────────

@router.callback_query(RegistrationForm.health_restrictions, F.data == "reg_health_has")
async def step_health_text_prompt(callback: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(RegistrationForm.health_text)
    await callback.message.edit_text("Напиши свои ограничения по здоровью:")
    await callback.answer()


@router.message(RegistrationForm.health_text)
async def step_tone_after_health(message: Message, state: FSMContext) -> None:
    await state.update_data(health_restrictions=message.text)
    await state.set_state(RegistrationForm.tone)
    await message.answer("Как тебе комфортнее общаться?", reply_markup=kb_tone())


# ── Тон → финал: сохранение в БД ─────────────────────────────────────────────

@router.callback_query(RegistrationForm.tone, F.data.startswith("reg_tone_"))
async def step_finish(callback: CallbackQuery, state: FSMContext) -> None:
    tone_key = callback.data.removeprefix("reg_tone_")
    data = await state.get_data()
    await state.clear()

    # Дата рождения
    birth_date: date | None = None
    if raw_bd := data.get("birth_date"):
        try:
            birth_date = date.fromisoformat(raw_bd)
        except ValueError:
            pass

    # Пол
    gender_val: Gender | None = {
        "male":   Gender.male,
        "female": Gender.female,
    }.get(data.get("gender", ""))

    # Activity level
    activity_val: ActivityLevel | None = None
    if raw_al := data.get("activity_level"):
        try:
            activity_val = ActivityLevel(raw_al)
        except ValueError:
            pass

    preferred_name = data.get("preferred_name")

    saved_profile = None
    async with AsyncSessionLocal() as session:
        user = await get_user_by_telegram_id(session, callback.from_user.id)
        if user:
            await update_user(session, user, is_active=True)
            saved_profile = await create_profile(
                session,
                user_id=user.id,
                preferred_name=preferred_name,
                gender=gender_val,
                birth_date=birth_date,
                goal=_GOAL_MAP.get(data.get("goal", "")),
                sport_type=data.get("sport_type"),
                fitness_level=_FITNESS_MAP.get(data.get("fitness_level", "")),
                activity_level=activity_val,
                workout_days_per_week=data.get("workout_days"),
                workout_hours_per_day=data.get("workout_hours"),
                health_restrictions=data.get("health_restrictions"),
                tone=Tone.aggressive if tone_key == "aggressive" else Tone.soft,
            )
            # Отправляем данные в GetCourse (не блокирует, ошибки — только в лог)
            if saved_profile:
                await _register_in_getcourse(user, saved_profile)

    display_name = preferred_name or callback.from_user.first_name or "друг"

    # Re-fetch user to get current subscription state after possible updates
    async with AsyncSessionLocal() as session:
        fresh_user = await get_user_by_telegram_id(session, callback.from_user.id)
        has_sub = _user_has_subscription(fresh_user) if fresh_user else False

    if has_sub:
        if tone_key == "aggressive":
            finish_text = f"Профиль настроен, {display_name}. Открывай приложение и работаем. 💪"
        else:
            finish_text = f"Всё готово, {display_name}! Твой личный кабинет ждёт тебя 🙌"
        reply_kb = InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(
                text="🚀 Открыть приложение",
                web_app=WebAppInfo(url=settings.MINI_APP_URL),
            )
        ]])
    else:
        finish_text = (
            f"Профиль создан, {display_name}! "
            "Выбери тариф чтобы получить доступ к AI-ассистенту и всем функциям."
        )
        buttons = []
        if settings.GC_PAYMENT_URL_MVP:
            buttons.append([InlineKeyboardButton(text="💳 Выбрать тариф MVP", url=settings.GC_PAYMENT_URL_MVP)])
        if settings.GC_PAYMENT_URL_AI:
            buttons.append([InlineKeyboardButton(text="ℹ️ Тариф AI — подробнее", url=settings.GC_PAYMENT_URL_AI)])
        if not buttons:
            buttons = [[InlineKeyboardButton(text="📩 Написать менеджеру", url=settings.SUPPORT_TG_URL)]]
        reply_kb = InlineKeyboardMarkup(inline_keyboard=buttons)

    await callback.message.edit_text(finish_text)
    await callback.message.answer(
        "👇" if has_sub else "Оформи подписку 👇",
        reply_markup=reply_kb,
    )
    if not has_sub:
        await callback.message.answer(
            "После оплаты нажми /start — бот сразу покажет кнопку приложения.",
            reply_markup=freemium_menu_kb(),
        )
    await callback.answer()


# ── Защита от текста вместо кнопки ───────────────────────────────────────────

_BUTTON_STATES = (
    RegistrationForm.greeting,
    RegistrationForm.gender,
    RegistrationForm.fitness_level,
    RegistrationForm.goal,
    RegistrationForm.sport_type,
    RegistrationForm.workout_hours,
    RegistrationForm.workout_days,
    RegistrationForm.lifestyle,
    RegistrationForm.health_restrictions,
    RegistrationForm.tone,
)


@router.message(
    StateFilter(*_BUTTON_STATES),
    F.text & ~F.text.startswith("/"),
)
async def handle_unexpected_text(message: Message) -> None:
    await message.answer("Пожалуйста, используй кнопки 👆")
