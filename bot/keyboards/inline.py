from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton


def kb_start() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Начать →", callback_data="reg_start")],
    ])


def kb_gender() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Мужской", callback_data="reg_gender_male"),
            InlineKeyboardButton(text="Женский", callback_data="reg_gender_female"),
        ],
    ])


def kb_fitness() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="🌱 Новичок — только начинаю",
            callback_data="reg_fitness_beginner",
        )],
        [InlineKeyboardButton(
            text="💪 Средний — тренируюсь регулярно",
            callback_data="reg_fitness_intermediate",
        )],
        [InlineKeyboardButton(
            text="🔥 Продвинутый — серьёзный опыт",
            callback_data="reg_fitness_advanced",
        )],
    ])


# ── Multi-select goals ────────────────────────────────────────────────────────

GOAL_OPTIONS = [
    ("muscle_gain", "Набор мышц"),
    ("weight_loss",  "Похудение"),
    ("endurance",    "Выносливость"),
    ("maintenance",  "Поддержание / здоровье"),
]


def kb_goals(selected: list[str]) -> InlineKeyboardMarkup:
    """Multi-select keyboard: tap to toggle, 'Done' when ≥1 selected."""
    rows = []
    for key, label in GOAL_OPTIONS:
        check = "✅ " if key in selected else "◻️ "
        rows.append([InlineKeyboardButton(
            text=f"{check}{label}",
            callback_data=f"reg_goals_toggle_{key}",
        )])
    if selected:
        rows.append([InlineKeyboardButton(
            text=f"Готово ({len(selected)}) →",
            callback_data="reg_goals_done",
        )])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def kb_sport() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Бокс / единоборства", callback_data="reg_sport_boxing"),
            InlineKeyboardButton(text="Фитнес / зал", callback_data="reg_sport_gym"),
        ],
        [
            InlineKeyboardButton(text="Бег / кардио", callback_data="reg_sport_running"),
            InlineKeyboardButton(text="Домашние тренировки", callback_data="reg_sport_home"),
        ],
        [
            InlineKeyboardButton(text="Не тренируюсь пока", callback_data="reg_sport_none"),
            InlineKeyboardButton(text="✏️ Другое", callback_data="reg_sport_other"),
        ],
    ])


def kb_workout_hours() -> InlineKeyboardMarkup:
    """Только для продвинутых — часов в ДЕНЬ."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="До 1 часа", callback_data="reg_hours_lt1")],
        [InlineKeyboardButton(text="1–2 часа", callback_data="reg_hours_1_2")],
        [InlineKeyboardButton(text="2–3 часа", callback_data="reg_hours_2_3")],
        [InlineKeyboardButton(text="Более 3 часов", callback_data="reg_hours_gt3")],
    ])


def kb_workout_days() -> InlineKeyboardMarkup:
    """Для всех — дней в неделю."""
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="1–2 дня в неделю", callback_data="reg_days_1_2")],
        [InlineKeyboardButton(text="3–4 дня в неделю", callback_data="reg_days_3_4")],
        [InlineKeyboardButton(text="5–6 дней в неделю", callback_data="reg_days_5_6")],
        [InlineKeyboardButton(text="Каждый день", callback_data="reg_days_every")],
    ])


def kb_lifestyle() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="Активный — много двигаюсь",
            callback_data="reg_lifestyle_active",
        )],
        [InlineKeyboardButton(
            text="Средний — по-разному",
            callback_data="reg_lifestyle_moderate",
        )],
        [InlineKeyboardButton(
            text="Сидячий — офис/дом",
            callback_data="reg_lifestyle_sedentary",
        )],
    ])


def kb_health() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="Нет ограничений", callback_data="reg_health_none")],
        [InlineKeyboardButton(text="Есть (напишу)", callback_data="reg_health_has")],
    ])


def kb_tone() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text="💪 Жёстко и по делу — без сюсюканий",
            callback_data="reg_tone_aggressive",
        )],
        [InlineKeyboardButton(
            text="🤝 Мягко и с поддержкой",
            callback_data="reg_tone_soft",
        )],
    ])


# ── Timezone ──────────────────────────────────────────────────────────────────

TIMEZONE_OPTIONS = [
    ("Europe/Kaliningrad", "UTC+2  Калининград"),
    ("Europe/Moscow",      "UTC+3  Москва / Питер"),
    ("Europe/Samara",      "UTC+4  Самара"),
    ("Asia/Yekaterinburg", "UTC+5  Екатеринбург"),
    ("Asia/Omsk",          "UTC+6  Омск"),
    ("Asia/Krasnoyarsk",   "UTC+7  Новосибирск / Красноярск"),
    ("Asia/Irkutsk",       "UTC+8  Иркутск"),
    ("Asia/Yakutsk",       "UTC+9  Якутск"),
    ("Asia/Vladivostok",   "UTC+10 Владивосток"),
    ("Asia/Magadan",       "UTC+11 Магадан"),
    ("Asia/Kamchatka",     "UTC+12 Камчатка"),
]


def kb_timezone() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=f"reg_tz_{key}")]
        for key, label in TIMEZONE_OPTIONS
    ])


# ── Push time ─────────────────────────────────────────────────────────────────

PUSH_TIME_OPTIONS = [
    ("06:00", "6:00"),
    ("07:00", "7:00"),
    ("08:00", "8:00"),
    ("09:00", "9:00"),
    ("10:00", "10:00"),
]


def kb_push_time() -> InlineKeyboardMarkup:
    rows = [
        [InlineKeyboardButton(text=label, callback_data=f"reg_pushtime_{t}")]
        for t, label in PUSH_TIME_OPTIONS
    ]
    rows.append([InlineKeyboardButton(text="✏️ Другое время", callback_data="reg_pushtime_custom")])
    return InlineKeyboardMarkup(inline_keyboard=rows)
