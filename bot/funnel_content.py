"""Verbatim funnel copy (texts, keyboards, video keys) from Ilya's ТЗ.

Two sections:

  STATIC — content for the always-available menu sections (О клубе,
  Выбрать тариф, Поддержка, FAQ). These are wired into bot/handlers/menu.py
  and live now.

  FUNNEL — content for the payment/onboarding/dunning sequence (paid
  PLUS/PRO flows, non-payer reminders). Wired in: registration.py
  (phone-not-found branch) and webhooks.py (GC payment webhook) call these
  send_* functions on their respective triggers — see ТЗ «онбординг с
  проверкой телефона, воронка недоплативших», 2026-07-10.

Two spots are explicitly left as TODO placeholders per Ilya ("текст не
готов — не сочинять"): the ПЛЮС→ПРО upgrade offer (25 min after PLUS
payment) and the tail of the "Ты активировал тариф «ПРО»" message (cut off
on the source screenshot). Do not invent copy for these — get it from the
client/Lena first.
"""
from aiogram import Bot
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

from bot.services.push_media import send_push_video
from core.config import settings

# ── Shared URLs ──────────────────────────────────────────────────────────────

# UTM string given verbatim in the ТЗ (the one fully-specified funnel URL,
# nonpayer_24h's "ВСТУПИТЬ В КЛУБ" button) — reused for every payment link
# in this funnel rather than inventing a different campaign tag.
_UTM = "utm_source=tg&utm_medium=mvp&utm_campaign=miniapp"

CHAT_URL = "https://t.me/+5_3U13qeveA3OWJi"
BOT_ACTIVATE_URL = "tg://resolve?domain=topdogmvp_tech_bot&start=8b8301408bf74717bab73bc14327facd__s4"
CLUB_JOIN_URL = f"https://topdog-mvp.ru/club?{_UTM}#form"
GC_CONTACT_FORM_URL = "https://topdog-mvp.ru/cms/system/contact"


def _with_utm(url: str) -> str:
    if not url:
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}{_UTM}"


def _webapp_button(text: str = "➤ НАСТРОИТЬ ПРОФИЛЬ") -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=text, web_app=WebAppInfo(url=settings.mini_app_url_versioned))
    ]])


def tariffs_kb(tg_id: int | None = None, pro_label: str = "➤ Выбрать ПРО", plus_label: str = "➤ Выбрать ПЛЮС") -> InlineKeyboardMarkup:
    """Payment-link keyboard shared by every "choose a plan" message.

    Appends both ?tg_id= (so GetCourse can relay it back and we link the
    subscription automatically) and the UTM params, on top of whatever's
    already in GC_PAYMENT_URL_PRO/PLUS.
    """
    def _url(base: str) -> str:
        if not base:
            return base
        url = base
        if tg_id:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}tg_id={tg_id}"
        return _with_utm(url)

    buttons = []
    if settings.GC_PAYMENT_URL_PRO:
        buttons.append([InlineKeyboardButton(text=pro_label, url=_url(settings.GC_PAYMENT_URL_PRO))])
    if settings.GC_PAYMENT_URL_PLUS:
        buttons.append([InlineKeyboardButton(text=plus_label, url=_url(settings.GC_PAYMENT_URL_PLUS))])
    if not buttons:
        buttons = [[InlineKeyboardButton(text="📩 Написать менеджеру", url=settings.SUPPORT_TG_URL)]]
    return InlineKeyboardMarkup(inline_keyboard=buttons)


TARIFFS_TEXT = (
    "Тарифы:\n\n"
    "ПРО — 2 990 Р/мес.\n"
    "— Доступ к AI-ассистенту: тренер, нутрициолог, фокус\n"
    "— Трекеры состояния: нагрузка, дисциплина, восстановление\n"
    "— Прогресс и аналитика по неделям\n"
    "— Доступ в закрытое сообщество с резидентами и спортсменами\n"
    "— База знаний (записи эфиров и мастер-классов)\n"
    "— Участие в разборах и получение экспертной обратной связи от главного тренера клуба\n"
    "— Участие в мероприятиях клуба\n\n"
    "ПЛЮС — 990 Р/мес.\n"
    "— Доступ к AI-ассистенту: тренер, нутрициолог, фокус\n"
    "— Трекеры состояния: нагрузка, дисциплина, восстановление\n"
    "— Прогресс и аналитика по неделям\n\n"
    "Ждём тебя в клубе. Стань MVP."
)


async def send_tariffs(bot: Bot, chat_id: int, tg_id: int | None = None) -> None:
    await bot.send_message(chat_id, TARIFFS_TEXT, reply_markup=tariffs_kb(tg_id))


# ══════════════════════════════════════════════════════════════════════════
# STATIC — always-available menu sections
# ══════════════════════════════════════════════════════════════════════════

ABOUT_CLUB_TEXT = (
    "MVP от TOP DOG — закрытый клуб, который помогает людям по всей России "
    "выстраивать здоровый образ жизни с помощью технологий, научного подхода "
    "и сильного окружения.\n\n"
    "Мы объединили тренировки, питание, восстановление, контроль состояния "
    "и поддержку расписания в одну систему:\n\n"
    "→ персональный AI-ассистент, объединяющий задачи тренера, нутрициолога, "
    "трекера анализов и прогресса\n"
    "→ комьюнити единомышленников\n"
    "→ экспертную обратную связь\n"
    "→ доступ к действующим атлетам и специалистам TOP DOG\n\n"
    "Задача клуба — помочь тебе видеть, как организм реагирует на нагрузку, "
    "где есть прогресс и какие элементы системы требуют корректировки. Внутри "
    "клуба собраны инструменты, специалисты и окружение, которые помогают "
    "удерживать режим, сохранять фокус и двигаться вперёд.\n\n"
    "Клуб подходит мужчинам и женщинам с любым уровнем физической подготовки. "
    "Здесь ты найдёшь поддержку, новых друзей и среду, в которой легче "
    "двигаться к своим целям.\n\n"
    "* MVP (Most Valuable Player) — самый ценный игрок: тот, кто решает исход "
    "игры. В клубе главный игрок — ты."
)


def about_club_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="➤ Выбрать тариф", callback_data="show_tariffs")
    ]])


async def send_about_club(bot: Bot, chat_id: int) -> None:
    await send_push_video(bot, chat_id, "about_club")
    await bot.send_message(chat_id, ABOUT_CLUB_TEXT, reply_markup=about_club_kb())


SUPPORT_TEXT = "Напиши нам — ответим в течение нескольких часов."


def support_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➤ Написать в геткурс", url=GC_CONTACT_FORM_URL)],
        [InlineKeyboardButton(text="➤ Написать в телеграм", url=settings.SUPPORT_TG_URL)],
    ])


FAQ_TEXT = (
    "Подойдёт ли мне клуб?\n"
    "Да. Клуб подходит мужчинам и женщинам, новичкам, и тем, кто уже давно "
    "тренируется.\n\n"
    "У меня мало времени. Сколько времени нужно уделять клубу?\n"
    "Клуб легко встроить в свой график. Основной фокус MVP в том, чтобы "
    "сделать тренировки, питание и контроль состояния понятными и "
    "регулярными. Ты сможешь выбирать нагрузку под своё расписание, используя "
    "ИИ-ассистента, отслеживать прогресс и подключаться к активностям клуба "
    "тогда, когда это удобно.\n\n"
    "Будет ли живое общение?\n"
    "Да. Ты получишь доступ в закрытое сообщество для общения, обмена "
    "опытом. Также планируются эфиры, тренировки, встречи и активности с "
    "атлетами и специалистами.\n\n"
    "Как оформить подписку?\n"
    "Жми на кнопку «Выбрать тариф», оплачивай подписку. После оплаты на твою "
    "почту придёт доступ в личный кабинет резидента и инструкция как зайти в "
    "закрытый чат!\n\n"
    "Какой тариф мне подойдёт?\n"
    "Тариф «ПЛЮС» даёт доступ к AI-ассистенту и трекерам. Тариф «ПРО» "
    "включает всё, что входит в «ПЛЮС», а также — доступ в закрытое "
    "сообщество с резидентами, возможность участия в мероприятиях клуба, "
    "регулярно пополняемая база знаний."
)


def faq_kb(tg_id: int | None = None) -> InlineKeyboardMarkup:
    return tariffs_kb(tg_id, pro_label="➤ Выбрать тариф ПРО", plus_label="➤ Выбрать тариф ПЛЮС")


# ══════════════════════════════════════════════════════════════════════════
# FUNNEL — payment / onboarding / dunning sequence
# ══════════════════════════════════════════════════════════════════════════

# The original standalone "welcome before payment" push (club pitch + a
# "Выбрать тариф" button, fired straight on /start) was replaced per ТЗ
# «онбординг с проверкой телефона» (2026-07-10): the pitch is now merged
# with the phone-number request and lives inline in
# bot/handlers/registration.py's cmd_start (no {name} yet at that step —
# it isn't known until after the name-input step later in registration).
# send_welcome_before_payment() / welcome_before_payment_kb() were removed
# as unused wrappers.

PHONE_NOT_FOUND_TEXT = (
    "Оплата с этим номером не найдена. Если уже оплатил — напиши в поддержку, разберёмся.\n\n"
    "Ждём тебя в клубе. Стань MVP."
)


def phone_not_found_kb(tg_id: int | None = None) -> InlineKeyboardMarkup:
    """Tariffs (via tariffs_kb — the single source of truth for payment
    links) plus a support row, for the "phone not found" branch that also
    kicks off the nonpayer dunning sequence."""
    kb = tariffs_kb(tg_id)
    kb.inline_keyboard.append(
        [InlineKeyboardButton(text="📩 Поддержка", url=settings.SUPPORT_TG_URL)]
    )
    return kb


# ── Оплатил ПЛЮС ─────────────────────────────────────────────────────────

async def send_paid_plus_circle(bot: Bot, chat_id: int) -> None:
    """Send immediately on PLUS payment (10-15s circle from Dima)."""
    await send_push_video(bot, chat_id, "circle_plus")


PAID_PLUS_WELCOME_TEXT = (
    "{name}, теперь ты в MVP 🙌🏼\n\n"
    "Я твой персональный AI-ассистент.\n\n"
    "Осознанный подход начинается с данных. Настроим твой профиль чтобы "
    "начать твой рост."
)


async def send_paid_plus_welcome(bot: Bot, chat_id: int, name: str) -> None:
    """Send 10s after send_paid_plus_circle."""
    await bot.send_message(
        chat_id,
        PAID_PLUS_WELCOME_TEXT.format(name=name),
        reply_markup=_webapp_button(),
    )


# TODO [Ilya/Lena]: ПЛЮС→ПРО upgrade offer, sent 25 min after PLUS payment.
# Copy not ready on the source schema (discount %, timer, one-time promo
# code — content, not just wording, is undecided). Do not invent this —
# get the real text + promo mechanics before writing a send_* for it.
PAID_PLUS_UPGRADE_OFFER_TEXT: str | None = None

# TODO [Ilya/Lena]: tail of "Ты активировал тариф «ПРО»" (sent when a PLUS
# resident upgrades to PRO within the same flow) — cut off on the source
# screenshot after this line. Get the full text before sending.
PAID_PLUS_THEN_PRO_TEXT = (
    "{name}, готово. Ты активировал тариф «ПРО».\n"
    "Вот, что тебе доступно:"
    # TODO: list continues here — text not provided
)

PAID_PLUS_1H_REMINDER_TEXT = "Остался один шаг — настроить профиль."


async def send_paid_plus_1h_reminder(bot: Bot, chat_id: int) -> None:
    """Send if the user hasn't opened the Mini App / set up their profile
    within 1 hour of the PLUS welcome message."""
    await bot.send_message(chat_id, PAID_PLUS_1H_REMINDER_TEXT, reply_markup=_webapp_button())


# ── Оплатил ПРО ──────────────────────────────────────────────────────────

async def send_paid_pro_circle(bot: Bot, chat_id: int) -> None:
    """Send immediately on PRO payment (10-15s circle from Dima/Регбист)."""
    await send_push_video(bot, chat_id, "circle_pro")


PAID_PRO_WELCOME_TEXT = (
    "{name}, теперь ты в MVP 🙌🏼\n\n"
    "Я твой персональный AI-ассистент.\n\n"
    "Осознанный подход начинается здесь. Вот что тебе нужно сделать:\n"
    "Шаг 1. Настрой профиль, чтобы пользоваться AI-ассистентом\n"
    "Шаг 2. Вступай в телеграм-чат с резидентами\n"
    "Шаг 3. Участвуй в онлайн- и офлайн-активностях клуба. Расписание — в "
    "телеграм-чате"
)


async def send_paid_pro_welcome(bot: Bot, chat_id: int, name: str) -> None:
    """Send 10s after send_paid_pro_circle."""
    await bot.send_message(
        chat_id,
        PAID_PRO_WELCOME_TEXT.format(name=name),
        reply_markup=_webapp_button(),
    )


PAID_PRO_STEP2_TEXT = (
    "Шаг 2. Вступай в телеграм-чат с резидентами по кнопке ниже\n\n"
    "‼Проверь, что ты подключил(а) бота MVP: @topdogmvp_tech_bot.\n"
    "Только после активации бота ты сможешь вступить в чат."
)


def paid_pro_step2_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="➤ ВСТУПИТЬ В ЧАТ", url=CHAT_URL)],
        [InlineKeyboardButton(text="➤ АКТИВИРОВАТЬ БОТА", url=BOT_ACTIVATE_URL)],
    ])


async def send_paid_pro_step2(bot: Bot, chat_id: int) -> None:
    """Send 10 min after send_paid_pro_welcome."""
    await bot.send_message(chat_id, PAID_PRO_STEP2_TEXT, reply_markup=paid_pro_step2_kb())


PAID_PRO_STEP3_TEXT = (
    "Шаг 3. Участвуй в онлайн- и офлайн-активностях клуба\n\n"
    "Тебя ждут эфиры, мастер-классы, тренировки, встречи, челленджи и другие "
    "форматы с участием ТОП-атлетов, профессиональных спортсменов и ведущих "
    "экспертов.\n\n"
    "Расписание всех мероприятий клуба находится в телеграм-чате в ветке "
    "«Афиша • новости», а также в твоём личном кабинете GetCourse."
)


def paid_pro_step3_kb() -> InlineKeyboardMarkup:
    buttons = [[InlineKeyboardButton(text="➤ ЧАТ КЛУБА", url=CHAT_URL)]]
    # settings.GC_CABINET_URL is not configured yet (see core/config.py) —
    # skip the button rather than send a dead link until it's filled in.
    if settings.GC_CABINET_URL:
        buttons.append([InlineKeyboardButton(text="➤ ЛИЧНЫЙ КАБИНЕТ", url=settings.GC_CABINET_URL)])
    return InlineKeyboardMarkup(inline_keyboard=buttons)


async def send_paid_pro_step3(bot: Bot, chat_id: int) -> None:
    """Send 10 min after send_paid_pro_step2 (~20 min after payment)."""
    await bot.send_message(chat_id, PAID_PRO_STEP3_TEXT, reply_markup=paid_pro_step3_kb())


# ── Не оплатил — дожим ───────────────────────────────────────────────────

NONPAYER_10MIN_TEXT = "Остался один шаг — выбрать тариф и вступить в клуб."


async def send_nonpayer_10min(bot: Bot, chat_id: int, tg_id: int | None = None) -> None:
    await bot.send_message(chat_id, NONPAYER_10MIN_TEXT, reply_markup=tariffs_kb(tg_id))


NONPAYER_24H_TEXT = (
    "{name}, залетай в наш челлендж!\n\n"
    "В закрытом клубе MVP Регбист уже запустил первый челлендж⭐\n\n"
    "Начали с отжиманий.\n\n"
    "Каждый день — +1 отжимание.\n"
    "Каждый день — отчёт.\n\n"
    "Проверим, кто первый дойдёт до 100?"
)


def nonpayer_24h_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="➤ ВСТУПИТЬ В КЛУБ", url=CLUB_JOIN_URL)
    ]])


async def send_nonpayer_24h(bot: Bot, chat_id: int, name: str) -> None:
    await send_push_video(bot, chat_id, "nonpayer_24h_challenge")
    await bot.send_message(
        chat_id,
        NONPAYER_24H_TEXT.format(name=name),
        reply_markup=nonpayer_24h_kb(),
    )


NONPAYER_3D_TEXT = (
    "Иногда, чтобы изменить свою жизнь, нужно изменить окружение.\n\n"
    "Выбрать тех, для кого здоровье, тренировки, режим, качественное "
    "питание и сильное тело — это норма жизни.\n\n"
    "Именно такие люди ждут тебя в MVP от TOP DOG."
)


def nonpayer_3d_kb() -> InlineKeyboardMarkup:
    # ТЗ doesn't give an explicit URL for this button — reusing CLUB_JOIN_URL
    # (same "join by paying" landing used one step earlier) rather than
    # inventing a new destination. Confirm with Ilya if this should differ.
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="➤ СТАНЬ MVP", url=CLUB_JOIN_URL)
    ]])


async def send_nonpayer_3d(bot: Bot, chat_id: int) -> None:
    await send_push_video(bot, chat_id, "nonpayer_3d_final")
    await bot.send_message(chat_id, NONPAYER_3D_TEXT, reply_markup=nonpayer_3d_kb())
