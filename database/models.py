import enum
from datetime import date, datetime

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, Enum, Float,
    ForeignKey, Integer, String, func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class SubscriptionStatus(str, enum.Enum):
    free = "free"
    premium = "premium"


class SubscriptionPeriod(str, enum.Enum):
    monthly = "monthly"    # 1 месяц
    biannual = "biannual"  # 6 месяцев


class Gender(str, enum.Enum):
    male = "male"
    female = "female"
    other = "other"


class Goal(str, enum.Enum):
    weight_loss = "weight_loss"
    muscle_gain = "muscle_gain"
    maintenance = "maintenance"
    endurance = "endurance"


class ActivityLevel(str, enum.Enum):
    sedentary = "sedentary"
    light = "light"
    moderate = "moderate"
    active = "active"
    very_active = "very_active"


class FitnessLevel(str, enum.Enum):
    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class Tone(str, enum.Enum):
    aggressive = "aggressive"
    soft = "soft"


class CheckinType(str, enum.Enum):
    morning = "morning"
    evening = "evening"
    post_workout = "post_workout"


class TrackerType(str, enum.Enum):
    weight = "weight"
    water = "water"
    sleep = "sleep"
    calories = "calories"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False, index=True)
    username: Mapped[str | None] = mapped_column(String(64))
    first_name: Mapped[str | None] = mapped_column(String(128))
    email: Mapped[str | None] = mapped_column(String(256), unique=True, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Legacy enum — kept for backwards compat, use subscription_type/status below
    subscription_status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus), default=SubscriptionStatus.free
    )

    # Billing fields
    subscription_type: Mapped[str | None] = mapped_column(String(16), nullable=True)    # null / "plus" / "pro"
    subscription_active: Mapped[str | None] = mapped_column(String(16), nullable=True)  # null / "active" / "inactive"
    subscription_period: Mapped[str | None] = mapped_column(String(16), nullable=True)  # null / "monthly" / "biannual"
    subscription_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped["Profile | None"] = relationship(back_populates="user", uselist=False)
    checkins: Mapped[list["Checkin"]] = relationship(back_populates="user")
    trackers: Mapped[list["Tracker"]] = relationship(back_populates="user")


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    preferred_name: Mapped[str | None] = mapped_column(String(64))   # как обращаться
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender))
    birth_date: Mapped[date | None] = mapped_column(Date)
    weight: Mapped[float | None] = mapped_column(Float)
    height: Mapped[float | None] = mapped_column(Float)
    goal: Mapped[Goal | None] = mapped_column(Enum(Goal))
    sport_type: Mapped[str | None] = mapped_column(String(128))
    activity_level: Mapped[ActivityLevel | None] = mapped_column(Enum(ActivityLevel))
    fitness_level: Mapped[FitnessLevel | None] = mapped_column(Enum(FitnessLevel))
    workout_days_per_week: Mapped[int | None] = mapped_column(Integer)
    workout_hours_per_day: Mapped[int | None] = mapped_column(Integer)  # только для продвинутых
    health_restrictions: Mapped[str | None] = mapped_column(String(512))
    tone: Mapped[Tone] = mapped_column(Enum(Tone), default=Tone.soft)
    # New fields
    goals: Mapped[list | None] = mapped_column(JSONB, nullable=True)       # ["muscle_gain", "weight_loss"]
    timezone: Mapped[str | None] = mapped_column(String(64), nullable=True)  # "Europe/Moscow"
    push_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "08:00" (morning)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="profile")


class Checkin(Base):
    __tablename__ = "checkins"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[CheckinType] = mapped_column(Enum(CheckinType), nullable=False)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="checkins")


class Tracker(Base):
    __tablename__ = "trackers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[TrackerType] = mapped_column(Enum(TrackerType), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="trackers")


class AiMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))   # "user" или "ai"
    text: Mapped[str] = mapped_column(String(4096))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UpgradeIntent(Base):
    __tablename__ = "upgrade_intents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, unique=True)
    clicked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remind_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
