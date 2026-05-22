from aiogram.fsm.state import State, StatesGroup


class RegistrationForm(StatesGroup):
    greeting = State()

    # 0. Имя — до анкеты
    name_input = State()

    # 1. Пол
    gender = State()

    # 2. Дата рождения
    birth_date_input = State()

    # 3. Уровень подготовки
    fitness_level = State()

    # 4. Цели (multi-select)
    goals = State()

    # 5. Вид спорта
    sport_type = State()
    sport_custom = State()

    # 6. Нагрузка (ветвление по уровню)
    workout_hours = State()   # только для продвинутых — часов В ДЕНЬ
    workout_days = State()    # для всех — дней в неделю

    # 7. Образ жизни
    lifestyle = State()

    # 8. Здоровье
    health_restrictions = State()
    health_text = State()

    # 9. Тон общения
    tone = State()

    # 10. Время утреннего чекина
    push_time = State()
    push_time_custom = State()   # если пользователь вводит вручную

    # 12. Время вечернего чекина
    evening_reminder_time = State()
