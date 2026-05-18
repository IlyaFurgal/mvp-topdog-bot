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


def kb_goal() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton(text="Набор мышц", callback_data="reg_goal_muscle_gain"),
            InlineKeyboardButton(text="Похудение", callback_data="reg_goal_weight_loss"),
        ],
        [
            InlineKeyboardButton(text="Выносливость", callback_data="reg_goal_endurance"),
            InlineKeyboardButton(text="Здоровье и ЗОЖ", callback_data="reg_goal_health"),
        ],
        [
            InlineKeyboardButton(text="Снижение стресса", callback_data="reg_goal_stress"),
            InlineKeyboardButton(text="Общая форма", callback_data="reg_goal_overall"),
        ],
    ])


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
