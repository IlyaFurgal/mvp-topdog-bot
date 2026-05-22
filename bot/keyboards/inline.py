from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup


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
    ("muscle_gain",    "Набор мышц"),
    ("weight_loss",    "Похудение"),
    ("endurance",      "Выносливость"),
    ("maintenance",    "Поддержание / здоровье"),
    ("stress",         "Снижение стресса"),
    ("sleep_quality",  "Улучшение сна"),
    ("rehabilitation", "Реабилитация"),
    ("competition",    "Соревнования"),
    ("flexibility",    "Гибкость / растяжка"),
]


def kb_goals(selected: list[str]) -> InlineKeyboardMarkup:
    """Multi-select keyboard: 2 per row, 'Done' when ≥1 selected."""
    rows = []
    items = list(GOAL_OPTIONS)
    for i in range(0, len(items), 2):
        row = []
        for key, label in items[i:i + 2]:
            check = "✅ " if key in selected else "◻️ "
            row.append(InlineKeyboardButton(
                text=f"{check}{label}",
                callback_data=f"reg_goals_toggle_{key}",
            ))
        rows.append(row)
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


# ── Timezone — inline UTC list ────────────────────────────────────────────────

_TIMEZONE_OPTIONS = [
    ("UTC-12", "UTC-12"),
    ("UTC-11", "UTC-11"),
    ("UTC-10", "UTC-10"),
    ("UTC-9",  "UTC-9"),
    ("UTC-8",  "UTC-8"),
    ("UTC-7",  "UTC-7"),
    ("UTC-6",  "UTC-6"),
    ("UTC-5",  "UTC-5"),
    ("UTC-4",  "UTC-4"),
    ("UTC-3",  "UTC-3"),
    ("UTC-2",  "UTC-2"),
    ("UTC-1",  "UTC-1"),
    ("UTC+0",  "UTC+0"),
    ("UTC+1",  "UTC+1"),
    ("UTC+2",  "UTC+2  Калининград"),
    ("UTC+3",  "UTC+3  Москва / Питер"),
    ("UTC+4",  "UTC+4  Самара"),
    ("UTC+5",  "UTC+5  Екатеринбург"),
    ("UTC+6",  "UTC+6  Омск"),
    ("UTC+7",  "UTC+7  Новосибирск"),
    ("UTC+8",  "UTC+8  Иркутск"),
    ("UTC+9",  "UTC+9  Якутск"),
    ("UTC+10", "UTC+10 Владивосток"),
    ("UTC+11", "UTC+11 Магадан"),
    ("UTC+12", "UTC+12 Камчатка"),
]


def kb_timezone() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text=label, callback_data=f"reg_tz_{key}")]
        for key, label in _TIMEZONE_OPTIONS
    ])


# ── Morning time: 05:00–12:00 step 30 min, 3 per row ─────────────────────────

def _build_time_range(start_h: int, start_m: int,
                      end_h: int, end_m: int) -> list[str]:
    times: list[str] = []
    h, m = start_h, start_m
    while (h, m) <= (end_h, end_m):
        times.append(f"{h:02d}:{m:02d}")
        m += 30
        if m >= 60:
            m = 0
            h += 1
    return times


def kb_push_time() -> InlineKeyboardMarkup:
    """05:00–12:00 step 30 min, 3 per row."""
    times = _build_time_range(5, 0, 12, 0)
    rows = []
    for i in range(0, len(times), 3):
        rows.append([
            InlineKeyboardButton(text=t, callback_data=f"reg_pushtime_{t}")
            for t in times[i:i + 3]
        ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


# ── Evening time: 18:00–23:30 step 30 min, 3 per row ─────────────────────────

def kb_evening_time() -> InlineKeyboardMarkup:
    """18:00–23:30 step 30 min, 3 per row."""
    times = _build_time_range(18, 0, 23, 30)
    rows = []
    for i in range(0, len(times), 3):
        rows.append([
            InlineKeyboardButton(text=t, callback_data=f"reg_eveningtime_{t}")
            for t in times[i:i + 3]
        ])
    return InlineKeyboardMarkup(inline_keyboard=rows)
