import asyncio
import base64
import json
import logging
import re
from datetime import date, datetime, timedelta, timezone

import httpx
from aiogram import F, Router
from aiogram.filters import Command, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup,
    Message, ReplyKeyboardRemove, WebAppInfo,
)

from bot.keyboards.inline import (
    kb_evening_time, kb_fitness, kb_gender, kb_goals, kb_health,
    kb_lifestyle, kb_push_time, kb_sport, kb_start,
    kb_tone, kb_workout_days, kb_workout_hours,
)
from bot.funnel_content import (
    PHONE_NOT_FOUND_TEXT, phone_not_found_kb, send_paid_plus_circle, send_paid_plus_welcome,
    send_paid_pro_circle, send_paid_pro_step2, send_paid_pro_step3, send_paid_pro_welcome,
    tariffs_kb,
)
from bot.services.push_media import send_push_video
from bot.handlers.menu import _user_has_subscription, _webapp_kb
from bot.keyboards.reply import freemium_menu_kb, main_menu_kb, request_contact_kb
from core.utils.phone import normalize_phone
from bot.states import RegistrationForm
from core.config import settings
from sqlalchemy import select
from database.crud import create_profile, create_user, get_user_by_telegram_id, update_user
from database.models import (
    ActivityLevel, FitnessLevel, Gender, GcSubscription, Goal, NeatLevel, NonpayerIntent,
    Profile, PromoActivation, PromoCode, SubscriptionStatus, Tone, Tracker, TrackerType, User,
)
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

_PROMO_CODE_RE = re.compile(r'^[a-zA-Z0-9_-]{1,64}$')


async def _handle_promo(message: Message, code: str) -> None:
    """Handle deep-link payload promo_<code>. Validates code, activates Pro atomically."""
    if not _PROMO_CODE_RE.match(code):
        await message.answer("Ссылка недействительна.")
        return

    tg_id = message.from_user.id

    async with AsyncSessionLocal() as session:
        # SELECT FOR UPDATE — atomic; prevents race-condition double-activation
        promo = (await session.execute(
            select(PromoCode).where(PromoCode.code == code).with_for_update()
        )).scalar_one_or_none()

        if promo is None or not promo.is_active:
            await message.answer("Ссылка недействительна.")
            return

        now = datetime.now(timezone.utc)
        if promo.expires_at.replace(tzinfo=timezone.utc) < now:
            await message.answer("Срок действия ссылки истёк.")
            return

        if promo.used_count >= promo.max_activations:
            await message.answer("Лимит активаций исчерпан.")
            return

        # Ensure user exists (may not have gone through registration yet)
        user = await get_user_by_telegram_id(session, tg_id)
        if not user:
            user = await create_user(
                session,
                telegram_id=tg_id,
                username=message.from_user.username,
                first_name=message.from_user.first_name,
            )

        # Guard against repeat activation by the same user
        existing = (await session.execute(
            select(PromoActivation).where(
                PromoActivation.promo_code_id == promo.id,
                PromoActivation.user_id == user.id,
            )
        )).scalar_one_or_none()

        if existing:
            await message.answer(
                "Доступ Pro уже активирован по этой ссылке 🔥\n"
                "Открой приложение 👇",
                reply_markup=_webapp_kb(),
            )
            return

        # Activate Pro
        expires = now + timedelta(days=promo.grant_days)
        user.subscription_type = promo.grant_type          # "pro"
        user.subscription_status = SubscriptionStatus.premium
        user.subscription_active = "active"
        user.subscription_expires_at = expires
        promo.used_count += 1
        session.add(PromoActivation(promo_code_id=promo.id, user_id=user.id))
        await session.commit()

    logger.info(
        "Promo activated: code=%r user=%s grant=%s days=%d expires=%s",
        code, tg_id, promo.grant_type, promo.grant_days, expires.date(),
    )
    await message.answer(
        f"Доступ Pro активирован на {promo.grant_days} дней 🔥\n"
        "Открой приложение 👇",
        reply_markup=_webapp_kb(),
    )


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

    # Deep-link: /start promo_<code>
    parts = (message.text or "").split(maxsplit=1)
    payload = parts[1].strip() if len(parts) > 1 else ""
    if payload.startswith("promo_"):
        await _handle_promo(message, payload[6:])
        return

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
                    f"Добро пожаловать обратно, {name}.",
                    reply_markup=_webapp_kb("▸ Открыть приложение"),
                )
            else:
                await message.answer(
                    f"Добро пожаловать обратно, {name}.",
                    reply_markup=freemium_menu_kb(),
                )
            return
        await create_user(
            session,
            telegram_id=message.from_user.id,
            username=message.from_user.username,
            first_name=message.from_user.first_name,
        )

    await send_push_video(message.bot, message.chat.id, "welcome_before_payment")
    name = message.from_user.first_name or "друг"
    await message.answer(
        f"*{name}, добро пожаловать в MVP.*\n\n"
        "Это клуб, где тренировки, питание и восстановление собраны в одну "
        "систему, а персональный AI-ассистент помогает следить за прогрессом и "
        "не даёт сойти с дистанции.\n\n"
        "Вот, что тебе будет доступно в клубе:\n\n"
        "*— AI-ассистент*\n"
        "Твой личный тренер, нутрициолог и контроль состояния.\n\n"
        "*— Комьюнити*\n"
        "Окружение с общими целями, челленджи с призами и поддержка кураторов.\n\n"
        "*— Топ-атлеты и специалисты*\n"
        "Прямой доступ к профессиональным спортсменам, бойцам TOP DOG, "
        "экспертам по питанию, медицине и физ. подготовке.\n\n"
        "*— Тренировки и встречи*\n"
        "Мастер-классы, эфиры, нетворк, открытые тренировки и офлайн-движухи.",
        reply_markup=freemium_menu_kb(),
        parse_mode="Markdown",
    )


# ── Проверка телефона по gc_subscriptions ─────────────────────────────────────

_background_tasks: set[asyncio.Task] = set()


def _spawn(coro) -> None:
    """Fire-and-forget a background task, keeping a strong reference so it
    isn't garbage-collected mid-flight (see api/routers/webhooks.py's
    identical helper — same footgun, this is the bot-process counterpart
    for the sign-in funnel below)."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


async def _run_plus_signin_funnel(bot, chat_id: int, name: str) -> None:
    """Circle + welcome push for an existing free user whose phone check
    just matched a PLUS GcSubscription — same tier-welcome funnel as a
    fresh GC payment webhook (webhooks.py), just triggered from a
    different entry point and using the already-live bot instance
    instead of spinning up a throwaway one."""
    try:
        await send_paid_plus_circle(bot, chat_id)
        await asyncio.sleep(10)
        await send_paid_plus_welcome(bot, chat_id, name)
    except Exception as exc:
        logger.error("PLUS sign-in funnel failed for chat_id=%s: %s", chat_id, exc)


async def _run_pro_signin_funnel(bot, chat_id: int, name: str) -> None:
    try:
        await send_paid_pro_circle(bot, chat_id)
        await asyncio.sleep(10)
        await send_paid_pro_welcome(bot, chat_id, name)
        await asyncio.sleep(600)
        await send_paid_pro_step2(bot, chat_id)
        await asyncio.sleep(600)
        await send_paid_pro_step3(bot, chat_id)
    except Exception as exc:
        logger.error("PRO sign-in funnel failed for chat_id=%s: %s", chat_id, exc)


@router.message(RegistrationForm.phone_check, F.contact)
async def contact_handler(message: Message, state: FSMContext) -> None:
    if message.contact.user_id != message.from_user.id:
        await message.answer(
            "Пожалуйста, воспользуйся кнопкой ниже, чтобы поделиться своим номером.",
            reply_markup=request_contact_kb(),
        )
        return

    phone = normalize_phone(message.contact.phone_number)
    if not phone:
        await message.answer(
            "Не удалось распознать номер. Попробуй ещё раз 👇",
            reply_markup=request_contact_kb(),
        )
        return

    await _process_phone_check(message, state, phone)


@router.message(RegistrationForm.phone_check, F.text)
async def manual_phone_handler(message: Message, state: FSMContext) -> None:
    """Let the user type the number by hand instead of sharing a contact —
    normalize_phone already tolerates 9xxxxxxxxx / +7.../ 7.../ 8... and
    any spaces/dashes/parens, so this reuses it verbatim rather than
    re-parsing. See ТЗ «пул правок», 2026-07-10."""
    phone = normalize_phone(message.text)
    if not phone:
        await message.answer(
            "Не удалось распознать номер. Напиши его цифрами (можно с +7, 8 или "
            "9 в начале) или поделись контактом кнопкой ниже 👇",
            reply_markup=request_contact_kb(),
        )
        return

    await _process_phone_check(message, state, phone)


async def _process_phone_check(message: Message, state: FSMContext, phone: str) -> None:
    await message.answer("Принял, проверяю номер…", reply_markup=ReplyKeyboardRemove())

    support_kb = InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="💬 Поддержка", url=settings.SUPPORT_TG_URL)
    ]])

    async with AsyncSessionLocal() as session:
        sub_result = await session.execute(
            select(GcSubscription).where(GcSubscription.phone_normalized == phone)
        )
        sub = sub_result.scalar_one_or_none()

        if sub is None:
            await state.clear()
            await message.answer(
                PHONE_NOT_FOUND_TEXT,
                reply_markup=phone_not_found_kb(message.from_user.id),
            )

            # Kick off the 10min -> 24h -> 3d dunning sequence from this
            # exact moment ("показали тарифы после неудачной проверки
            # телефона" — ТЗ «воронка недоплативших», 2026-07-10). A
            # user re-checking a still-unrecognised number restarts the
            # clock, matching UpgradeIntent's own re-click behaviour.
            user_for_intent = await get_user_by_telegram_id(session, message.from_user.id)
            if user_for_intent:
                intent = (await session.execute(
                    select(NonpayerIntent).where(NonpayerIntent.user_id == user_for_intent.id)
                )).scalar_one_or_none()
                if intent:
                    intent.clicked_at = datetime.now(timezone.utc)
                    intent.remind_count = 0
                    intent.reminded_at = None
                else:
                    session.add(NonpayerIntent(user_id=user_for_intent.id))
                await session.commit()
            return

        if sub.telegram_id is not None and sub.telegram_id != message.from_user.id:
            await state.clear()
            await message.answer(
                "Эта подписка уже привязана к другому аккаунту.\n"
                "Если это ошибка — напиши нам:",
                reply_markup=support_kb,
            )
            return

        # Привязать и активировать
        sub.telegram_id = message.from_user.id
        user = await get_user_by_telegram_id(session, message.from_user.id)
        user.subscription_type = sub.tier.value
        user.subscription_active = "active"
        user.subscription_expires_at = sub.expires_at
        user.subscription_status = SubscriptionStatus.premium
        await session.commit()

        profile_res = await session.execute(
            select(Profile).where(Profile.user_id == user.id)
        )
        has_profile = profile_res.scalar_one_or_none() is not None
        tier = sub.tier.value
        name = user.first_name or "друг"

    await state.clear()

    if has_profile:
        # Существующий free-пользователь, подписка нашлась — та же
        # tier-приветственная воронка (кружок + пуш), что и при живой
        # оплате через GC webhook, вместо статичного "Доступ открыт!"
        # (см. api/routers/webhooks.py's _run_plus/pro_payment_funnel).
        await message.answer("Главное меню:", reply_markup=main_menu_kb())
        if tier == "plus":
            _spawn(_run_plus_signin_funnel(message.bot, message.chat.id, name))
        elif tier == "pro":
            _spawn(_run_pro_signin_funnel(message.bot, message.chat.id, name))
        else:
            await message.answer(
                "Доступ открыт! 🏆\n\n"
                "Ты теперь резидент MVP by TopDog. Открывай приложение:",
                reply_markup=_webapp_kb(),
            )
    else:
        # Новый пользователь — переходим к анкете
        await state.set_state(RegistrationForm.greeting)
        await message.answer(
            "Доступ подтверждён! 🏆\n\n"
            "Давай настроим профиль — это займёт 2 минуты.\n"
            "Чем точнее заполнишь, тем точнее подберу программу — отвечай честно, "
            "потом всё можно поменять в профиле:",
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


# ── Парсинг даты рождения ────────────────────────────────────────────────────

_BD_FORMATS_HINT = "Примеры: 15.03.1990  15/03/1990  15-03-1990  1990-03-15"
_MIN_AGE = 10   # лет, минимально допустимый возраст
_MAX_YEAR = 1900


def _parse_birth_date(text: str) -> date:
    """
    Parse user-entered birth date, tolerant of separators and year-first format.
    Raises ValueError with a human-readable message on bad input.
    """
    raw = text.strip()
    # Normalise separators to dot
    raw = re.sub(r"[/\-]", ".", raw)
    parts = raw.split(".")
    if len(parts) != 3:
        raise ValueError("Нужно три числа (день, месяц, год).")

    try:
        p0, p1, p2 = int(parts[0]), int(parts[1]), int(parts[2])
    except ValueError:
        raise ValueError("В дате должны быть только цифры.")

    # Detect year-first if first component has 4 digits
    if len(parts[0]) == 4:
        year, month, day = p0, p1, p2
    else:
        day, month, year = p0, p1, p2

    try:
        birth = date(year, month, day)
    except ValueError:
        raise ValueError(f"Такой даты не существует: {day:02d}.{month:02d}.{year}.")

    today = date.today()
    if year < _MAX_YEAR:
        raise ValueError(f"Год не может быть раньше {_MAX_YEAR}.")
    if birth > today:
        raise ValueError("Дата не может быть в будущем.")
    if (today - birth).days < _MIN_AGE * 365:
        raise ValueError(f"Возраст должен быть не менее {_MIN_AGE} лет.")

    return birth


# ── Пол → дата рождения ───────────────────────────────────────────────────────

@router.callback_query(RegistrationForm.gender, F.data.startswith("reg_gender_"))
async def step_birth_date(callback: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(gender=callback.data.removeprefix("reg_gender_"))
    await state.set_state(RegistrationForm.birth_date_input)
    await callback.message.edit_text(
        "Введи дату рождения 🎂\n\n"
        f"{_BD_FORMATS_HINT}"
    )
    await callback.answer()


# ── Ввод даты рождения → уровень подготовки ──────────────────────────────────

@router.message(RegistrationForm.birth_date_input)
async def step_fitness(message: Message, state: FSMContext) -> None:
    try:
        birth = _parse_birth_date(message.text or "")
    except ValueError as exc:
        await message.answer(
            f"⚠️ {exc}\n\n"
            f"{_BD_FORMATS_HINT}"
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
    await message.answer(
        "Какой у тебя уровень подготовки?\n\n"
        "Оцени объективно — от этого зависит, не окажется ли план слишком лёгким или слишком тяжёлым:",
        reply_markup=kb_fitness(),
    )


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
    await callback.message.edit_text(
        "Какая у тебя дневная активность вне тренировок?", reply_markup=kb_lifestyle()
    )
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
    await callback.message.edit_text(
        "Напиши свои ограничения по здоровью:\n\n"
        "Опиши подробно — травмы, хронические состояния, противопоказания, даже если кажутся незначительными. Чем подробнее, тем безопаснее будут рекомендации."
    )
    await callback.answer()


@router.message(RegistrationForm.health_text)
async def step_tone_after_health(message: Message, state: FSMContext) -> None:
    await state.update_data(health_restrictions=message.text)
    await state.set_state(RegistrationForm.tone)
    await message.answer("Как тебе комфортнее общаться?", reply_markup=kb_tone())


# ── Тон → утреннее время ─────────────────────────────────────────────────────

@router.callback_query(RegistrationForm.tone, F.data.startswith("reg_tone_"))
async def step_tone_selected(callback: CallbackQuery, state: FSMContext) -> None:
    tone_key = callback.data.removeprefix("reg_tone_")
    await state.update_data(tone=tone_key)
    await state.set_state(RegistrationForm.push_time)
    await callback.message.edit_text(
        "Выбери время утреннего чекина ☀️\n\n"
        "Когда тебе удобно начинать день и отмечать своё состояние?\n\n"
        "📍 Часовой пояс определится автоматически при первом входе в приложение.",
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

    # Activity level (legacy — no longer feeds the calorie formula, see
    # neat_level below, but still saved for backward compat / other uses)
    activity_val: ActivityLevel | None = None
    if raw_al := data.get("activity_level"):
        try:
            activity_val = ActivityLevel(raw_al)
        except ValueError:
            pass

    # NEAT level (дневная активность вне тренировок) — the "образ жизни"
    # question, now feeds the calorie formula's base coefficient instead
    # of being collected and discarded.
    neat_val: NeatLevel | None = None
    if raw_neat := data.get("lifestyle"):
        try:
            neat_val = NeatLevel(raw_neat)
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
                neat_level=neat_val,
                workout_days_per_week=data.get("workout_days"),
                workout_hours_per_day=data.get("workout_hours"),
                health_restrictions=data.get("health_restrictions"),
                tone=tone_val,
                timezone='UTC+3',
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

    if has_sub:
        await send("Главное меню:", reply_markup=main_menu_kb())
    else:
        # If no subscription — additionally show payment options
        await send(
            "Для доступа ко всем функциям оформи подписку:",
            reply_markup=tariffs_kb(target.from_user.id),
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
    RegistrationForm.push_time,
    RegistrationForm.evening_reminder_time,
)


@router.message(
    StateFilter(*_BUTTON_STATES),
    F.text & ~F.text.startswith("/"),
)
async def handle_unexpected_text(message: Message) -> None:
    await message.answer("Пожалуйста, используй кнопки 👆")
