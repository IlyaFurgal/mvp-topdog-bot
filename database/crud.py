from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import (
    ActivityLevel, FitnessLevel, Gender, Goal, Profile, Tone, User,
)


async def get_user_by_telegram_id(session: AsyncSession, telegram_id: int) -> User | None:
    result = await session.execute(select(User).where(User.telegram_id == telegram_id))
    return result.scalar_one_or_none()


async def create_user(
    session: AsyncSession,
    telegram_id: int,
    username: str | None,
    first_name: str | None,
) -> User:
    user = User(telegram_id=telegram_id, username=username, first_name=first_name)
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def update_user(session: AsyncSession, user: User, **kwargs) -> User:
    for key, value in kwargs.items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return user


async def create_profile(
    session: AsyncSession,
    user_id: int,
    preferred_name: str | None = None,
    gender: Gender | None = None,
    birth_date: date | None = None,
    goal: Goal | None = None,
    goals: list[str] | None = None,
    sport_type: str | None = None,
    fitness_level: FitnessLevel | None = None,
    activity_level: ActivityLevel | None = None,
    workout_days_per_week: int | None = None,
    workout_hours_per_day: int | None = None,
    health_restrictions: str | None = None,
    tone: Tone = Tone.soft,
    timezone: str | None = None,
    push_time: str | None = None,
    morning_reminder_time: str | None = None,
    evening_reminder_time: str | None = None,
    weight: float | None = None,
    height: float | None = None,
) -> Profile:
    profile = Profile(
        user_id=user_id,
        preferred_name=preferred_name,
        gender=gender,
        birth_date=birth_date,
        goal=goal,
        goals=goals,
        sport_type=sport_type,
        fitness_level=fitness_level,
        activity_level=activity_level,
        workout_days_per_week=workout_days_per_week,
        workout_hours_per_day=workout_hours_per_day,
        health_restrictions=health_restrictions,
        tone=tone,
        timezone=timezone,
        push_time=push_time,
        morning_reminder_time=morning_reminder_time,
        evening_reminder_time=evening_reminder_time,
        weight=weight,
        height=height,
    )
    session.add(profile)
    await session.commit()
    await session.refresh(profile)
    return profile
