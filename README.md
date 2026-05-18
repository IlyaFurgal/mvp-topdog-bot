# TopDog MVP

Telegram-бот и API для персонального фитнес-коучинга.

## Стек

- Python 3.12
- FastAPI + uvicorn
- aiogram 3.x
- PostgreSQL 16
- SQLAlchemy 2.x + asyncpg
- Alembic
- Docker + docker-compose

## Быстрый старт

### 1. Настройте переменные окружения

```bash
cp .env.example .env
```

Заполните `.env`:

| Переменная | Описание |
|---|---|
| `BOT_TOKEN` | Токен бота из @BotFather |
| `POSTGRES_USER` | Пользователь PostgreSQL |
| `POSTGRES_PASSWORD` | Пароль PostgreSQL |
| `SUVVY_API_KEY` | Ключ API Suvvy |

### 2. Запустите проект

```bash
docker compose up --build
```

### 3. Проверьте работу

- Откройте бот в Telegram и отправьте `/start` — бот ответит "Привет! Бот запущен."
- Откройте `http://localhost:8000/health` — API вернёт `{"status": "ok"}`
- Откройте `http://localhost:8000/users` — список пользователей из БД

## Миграции

Создать новую миграцию:

```bash
docker compose run --rm api alembic revision --autogenerate -m "description"
```

Применить миграции:

```bash
docker compose run --rm api alembic upgrade head
```

## Структура проекта

```
topdog-mvp/
├── bot/                # aiogram бот
│   ├── main.py
│   ├── handlers/
│   └── keyboards/
├── api/                # FastAPI
│   ├── main.py
│   └── routers/
├── database/           # SQLAlchemy модели и миграции
│   ├── models.py
│   ├── session.py
│   └── migrations/
├── core/
│   └── config.py       # Настройки из .env
├── docker-compose.yml
├── Dockerfile.bot
├── Dockerfile.api
└── requirements.txt
```
