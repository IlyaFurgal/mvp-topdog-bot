import base64
import json
import logging
from datetime import date

import httpx
from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup,
    Message, WebAppInfo,
)

from bot.keyboards.inline import (
    kb_evening_time, kb_fitness, kb_gender, kb_goals, kb_health,
    kb_lifestyle, kb_push_time, kb_sport, kb_start,
    kb_timezone, kb_tone, kb_workout_days, kb_workout_hours,
)
from bot.handlers.menu import _user_has_subscription, _webapp_kb
from bot.keyboards.reply import freemium_menu_kb, main_menu_kb
from bot.states import RegistrationForm
from core.config import settings
from database.crud import create_profile, create_user, get_user_by_telegram_id, update_user
from database.models import ActivityLevel, FitnessLevel, Gender, Goal, Profile, SubscriptionStatus, Tone, Tracker, TrackerType, User
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)

router = Router()

# ── Маппинги ──────────────────────────────────────────────────────────────────

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

# Goals: new multi-select keys → legacy Goal enum (for backward compat)
_GOAL_MAP: dict[str, Goal] = {
    "muscle_gain": Goal.muscle_gain,
    "weight_loss":  Goal.weight_loss,
    "endurance":    Goal.endurance,
    "maintenance":  Goal.maintenance,
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
    goals_str = ", ".join(profile.goals) if profile.goals else (
        profile.goal.value if profile.goal else ""
    )
    data = {
        "user": {
            "email": None,
            "first_name": user.first_name or "",
            "addfields": {
                "telegram_id": str(user.telegram_id),
                "goal": goals_str,
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
    await state.set_state(RegistrationForm.weight_input)
    await message.answer("Укажи свой вес в кг 💪\n\nНапример: 75 или 75.5")


# ── Ввод веса → запросить рост ────────────────────────────────────────────────

@router.message(RegistrationForm.weight_input)
async def step_height_from_weight(message: Message, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace(",", ".")
    try:
        weight = float(raw)
        if weight < 30 or weight > 300:
            raise ValueError
    except ValueError:
        await message.answer(
            "⚠️ Введи вес числом от 30 до 300 кг\n"
            "Например: 75 или 75.5"
        )
        return
    await state.update_data(weight=weight)
    await state.set_state(RegistrationForm.height_input)
    await message.answer("Укажи свой рост в см 📏\n\nНапример: 178")


# ── Ввод роста → уровень подготовки ───────────────────────────────────────────

@router.message(RegistrationForm.height_input)
async def step_fitness_from_height(message: Message, state: FSMContext) -> None:
    raw = (message.text or "").strip().replace(",", ".")
    try:
        height = int(float(raw))
        if height < 100 or height > 250:
            raise ValueError
    except ValueError:
        await message.answer(
            "⚠️ Введи рост числом от 100 до 250 см\n"
            "Например: 178"
        )
        return
    await state.update_data(height=height)
    await state.set_state(RegistrationForm.fitness_level)
    await message.answer("Какой у тебя уровень подготовки?", reply_markup=kb_fitness())


# ── Уровень подготовки → цели (multi-select) ──────────────────────────────────

@router.callback_query(RegistrationForm.fitness_level, F.data.startswith("reg_fitness_"))
async def step_goals(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(fitness_level=callback.data.removeprefix("reg_fitness_"), goals_selected=[])
    await state.set_state(RegistrationForm.goals)
    await callback.message.edit_text(
        "Выбери свои цели 🎯\n\n"
        "Можно выбрать несколько — нажми на каждую нужную цель:",
        reply_markup=kb_goals([]),
    )
    await callback.answer()


# ── Цели: переключение вариантов ─────────────────────────────────────────────

@router.callback_query(RegistrationForm.goals, F.data.startswith("reg_goals_toggle_"))
async def step_goals_toggle(callback: CallbackQuery, state: FSMContext) -> None:
    key = callback.data.removeprefix("reg_goals_toggle_")
    data = await state.get_data()
    selected: list[str] = data.get("goals_selected", [])
    if key in selected:
        selected.remove(key)
    else:
        selected.append(key)
    await state.update_data(goals_selected=selected)
    await callback.message.edit_reply_markup(reply_markup=kb_goals(selected))
    await callback.answer()


# ── Цели: "Готово" → вид спорта ───────────────────────────────────────────────

@router.callback_query(RegistrationForm.goals, F.data == "reg_goals_done")
async def step_sport(callback: CallbackQuery, state: FSMContext) -> None:
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


# ── Тон → часовой пояс ───────────────────────────────────────────────────────

@router.callback_query(RegistrationForm.tone, F.data.startswith("reg_tone_"))
async def step_timezone(callback: CallbackQuery, state: FSMContext) -> None:
    tone_key = callback.data.removeprefix("reg_tone_")
    await state.update_data(tone=tone_key)
    await state.set_state(RegistrationForm.timezone)
    await callback.message.edit_text(
        "Выбери свой часовой пояс 🌍",
        reply_markup=kb_timezone(),
    )
    await callback.answer()


# ── Часовой пояс → утреннее время ────────────────────────────────────────────

@router.callback_query(RegistrationForm.timezone, F.data.startswith("reg_tz_"))
async def step_timezone_selected(callback: CallbackQuery, state: FSMContext) -> None:
    tz = callback.data.removeprefix("reg_tz_")
    await state.update_data(timezone=tz)
    await state.set_state(RegistrationForm.push_time)
    await callback.message.edit_text(
        "Выбери время утреннего чекина ☀️\n\n"
        "Когда тебе удобно начинать день и отмечать своё состояние?",
        reply_markup=kb_push_time(),
    )
    await callback.answer()


# ── Утреннее время: быстрый выбор → вечернее время ───────────────────────────

@router.callback_query(RegistrationForm.push_time, F.data.startswith("reg_pushtime_"))
async def step_pushtime_selected(callback: CallbackQuery, state: FSMContext) -> None:
    val = callback.data.removeprefix("reg_pushtime_")
    if val == "custom":
        await state.set_state(RegistrationForm.push_time_custom)
        await callback.message.edit_text(
            "Напиши время в формате ЧЧ:ММ, например: 07:30"
        )
        await callback.answer()
        return
    await state.update_data(push_time=val)
    await _ask_evening_time(callback, state)


# ── Утреннее время: ручной ввод → вечернее время ─────────────────────────────

@router.message(RegistrationForm.push_time_custom)
async def step_pushtime_custom(message: Message, state: FSMContext) -> None:
    raw = (message.text or "").strip()
    try:
        parts = raw.split(":")
        if len(parts) != 2:
            raise ValueError
        hh, mm = int(parts[0]), int(parts[1])
        if not (0 <= hh <= 23 and 0 <= mm <= 59):
            raise ValueError
        push_time = f"{hh:02d}:{mm:02d}"
    except ValueError:
        await message.answer(
            "⚠️ Неверный формат. Напиши время как ЧЧ:ММ, например: 07:30"
        )
        return
    await state.update_data(push_time=push_time)
    await _ask_evening_time(message, state)


async def _ask_evening_time(target: CallbackQuery | Message, state: FSMContext) -> None:
    await state.set_state(RegistrationForm.evening_reminder_time)
    text = (
        "Выбери время вечернего чекина 🌙\n\n"
        "Когда тебе удобно подводить итог дня?"
    )
    kb = kb_evening_time()
    if isinstance(target, CallbackQuery):
        await target.message.edit_text(text, reply_markup=kb)
        await target.answer()
    else:
        await target.answer(text, reply_markup=kb)


# ── Вечернее время → финал ───────────────────────────────────────────────────

@router.callback_query(
    RegistrationForm.evening_reminder_time,
    F.data.startswith("reg_eveningtime_"),
)
async def step_eveningtime_selected(callback: CallbackQuery, state: FSMContext) -> None:
    val = callback.data.removeprefix("reg_eveningtime_")
    await state.update_data(evening_reminder_time=val)
    await _finish_registration(callback, state)


# ── Финальный шаг: сохранение в БД и приветствие ─────────────────────────────

async def _finish_registration(target: CallbackQuery | Message, state: FSMContext) -> None:
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

    # Tone
    tone_key = data.get("tone", "soft")
    tone_val = Tone.aggressive if tone_key == "aggressive" else Tone.soft

    # Goals — new array + legacy first goal for backward compat
    goals_selected: list[str] = data.get("goals_selected", [])
    legacy_goal: Goal | None = _GOAL_MAP.get(goals_selected[0]) if goals_selected else None

    preferred_name = data.get("preferred_name")

    # Morning / evening reminder times
    morning_time = data.get("push_time") or "08:00"
    evening_time = data.get("evening_reminder_time") or "21:00"

    # Weight / height collected in FSM
    weight_val: float | None = data.get("weight")
    height_val: float | None = data.get("height")

    saved_profile = None
    async with AsyncSessionLocal() as session:
        telegram_id = target.from_user.id
        user = await get_user_by_telegram_id(session, telegram_id)
        if user:
            await update_user(session, user, is_active=True)
            saved_profile = await create_profile(
                session,
                user_id=user.id,
                preferred_name=preferred_name,
                gender=gender_val,
                birth_date=birth_date,
                goal=legacy_goal,
                goals=goals_selected if goals_selected else None,
                sport_type=data.get("sport_type"),
                fitness_level=_FITNESS_MAP.get(data.get("fitness_level", "")),
                activity_level=activity_val,
                workout_days_per_week=data.get("workout_days"),
                workout_hours_per_day=data.get("workout_hours"),
                health_restrictions=data.get("health_restrictions"),
                tone=tone_val,
                timezone=data.get("timezone"),
                push_time=morning_time,
                morning_reminder_time=morning_time,
                evening_reminder_time=evening_time,
                weight=weight_val,
                height=height_val,
            )
            # First weight tracker → стартовая точка в истории/графике
            if saved_profile and weight_val is not None:
                session.add(Tracker(
                    user_id=user.id,
                    type=TrackerType.weight,
                    value=weight_val,
                    unit="kg",
                ))
                await session.commit()
            if saved_profile:
                await _register_in_getcourse(user, saved_profile)

    display_name = preferred_name or (
        target.from_user.first_name if target.from_user else "друг"
    ) or "друг"

    # Re-fetch user to get current subscription state
    async with AsyncSessionLocal() as session:
        fresh_user = await get_user_by_telegram_id(session, target.from_user.id)
        has_sub = _user_has_subscription(fresh_user) if fresh_user else False

    # Confirm profile saved
    confirm_text = f"Профиль создан, {display_name}! 💪"
    if isinstance(target, CallbackQuery):
        await target.message.edit_text(confirm_text)
        send = target.message.answer
    else:
        await target.answer(confirm_text)
        send = target.answer

    # Welcome message — always sent to ALL new users
    welcome_text = (
        "Добро пожаловать в MVP by TopDog! 🔥\n\n"
        "Ты в системе. Вот что тебе доступно:\n\n"
        "🤖 ИИ-АССИСТЕНТ — задавай любые вопросы по тренировкам, питанию и восстановлению\n"
        "📊 ТРЕКЕР — заполняй каждый день: утро, тренировка, вечер\n"
        "📈 ПРОГРЕСС — следи за динамикой по неделям\n"
        "💬 ЧАТ РЕЗИДЕНТОВ — общение и поддержка сообщества\n"
        "📚 БАЗА ЗНАНИЙ — программы, нутрициология, записи эфиров\n"
        "👤 ПРОФИЛЬ — твои данные и тариф\n\n"
        "Открывай приложение и начинай 👇"
    )
    welcome_kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text="ОТКРЫТЬ MVP APP",
            web_app=WebAppInfo(url=settings.mini_app_url_versioned),
        )
    ]])
    await send(welcome_text, reply_markup=welcome_kb)

    # If no subscription — additionally show payment options
    if not has_sub:
        buttons = []
        if settings.GETCOURSE_PRO_URL or settings.GC_PAYMENT_URL_PRO:
            url = settings.GETCOURSE_PRO_URL or settings.GC_PAYMENT_URL_PRO
            buttons.append([InlineKeyboardButton(text="Pro — от 2 990 ₽/мес", url=url)])
        if settings.GETCOURSE_PLUS_URL or settings.GC_PAYMENT_URL_PLUS:
            url = settings.GETCOURSE_PLUS_URL or settings.GC_PAYMENT_URL_PLUS
            buttons.append([InlineKeyboardButton(text="Plus — от 990 ₽/мес", url=url)])
        if not buttons:
            buttons = [[InlineKeyboardButton(text="Написать менеджеру", url=settings.SUPPORT_TG_URL)]]
        pay_kb = InlineKeyboardMarkup(inline_keyboard=buttons)
        await send(
            "Для доступа ко всем функциям оформи подписку:",
            reply_markup=pay_kb,
        )
        await send(
            "После оплаты нажми /start — бот сразу покажет кнопку приложения.",
            reply_markup=freemium_menu_kb(),
        )

    if isinstance(target, CallbackQuery):
        await target.answer()


# ── Защита от текста вместо кнопки ───────────────────────────────────────────

_BUTTON_STATES = (
    RegistrationForm.greeting,
    RegistrationForm.gender,
    RegistrationForm.fitness_level,
    RegistrationForm.goals,
    RegistrationForm.sport_type,
    RegistrationForm.workout_hours,
    RegistrationForm.workout_days,
    RegistrationForm.lifestyle,
    RegistrationForm.health_restrictions,
    RegistrationForm.tone,
    RegistrationForm.timezone,
    RegistrationForm.push_time,
    RegistrationForm.evening_reminder_time,
)


@router.message(
    StateFilter(*_BUTTON_STATES),
    F.text & ~F.text.startswith("/"),
)
async def handle_unexpected_text(message: Message) -> None:
    await message.answer("Пожалуйста, используй кнопки 👆")
