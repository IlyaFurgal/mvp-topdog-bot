from aiogram.types import ReplyKeyboardMarkup, KeyboardButton


def request_contact_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text="📱 Поделиться номером", request_contact=True)]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )


def main_menu_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="🤖 ИИ-ассистент"),
                KeyboardButton(text="📊 Мой прогресс"),
            ],
            [
                KeyboardButton(text="✅ Чекин"),
                KeyboardButton(text="👤 Мой профиль"),
            ],
            [
                KeyboardButton(text="⚙️ Настройки"),
            ],
        ],
        resize_keyboard=True,
    )


def freemium_menu_kb() -> ReplyKeyboardMarkup:
    """Keyboard for users without active subscription."""
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(text="📋 О клубе"),
                KeyboardButton(text="💳 Выбрать тариф"),
            ],
            [
                KeyboardButton(text="❓ Поддержка"),
                KeyboardButton(text="📖 FAQ"),
            ],
            [
                KeyboardButton(text="✅ Я оплатил / Проверить доступ"),
            ],
        ],
        resize_keyboard=True,
    )
