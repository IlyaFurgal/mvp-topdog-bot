import enum
from datetime import date, datetime

from sqlalchemy import (
    BigInteger, Boolean, Date, DateTime, Enum, Float,
    ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func,
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
    pulse = "pulse"


class GcTier(str, enum.Enum):
    plus = "plus"
    pro = "pro"


class GcStatus(str, enum.Enum):
    active = "active"
    cancelled = "cancelled"


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

    # App visit tracking — gates pushes on actual Mini App usage, not just an active subscription
    subscription_activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_app_open_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_app_open_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    timezone: Mapped[str | None] = mapped_column(String(16), nullable=True)  # "UTC+3"
    push_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "08:00" (morning, alias)
    morning_reminder_time: Mapped[str | None] = mapped_column(String(5), nullable=True, default="08:00")
    evening_reminder_time: Mapped[str | None] = mapped_column(String(5), nullable=True, default="21:00")
    notifications_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default='true')
    additional_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    avatar_path: Mapped[str | None] = mapped_column(String(255), nullable=True)  # "/uploads/<uuid>.jpg"
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
    # Meal metadata (calories only); nullable for backward compat
    meal_type: Mapped[str | None] = mapped_column(String(16), nullable=True)   # breakfast|lunch|dinner|snack
    label: Mapped[str | None] = mapped_column(String(256), nullable=True)      # название блюда (задел под фото→калории)
    source: Mapped[str | None] = mapped_column(String(16), nullable=True)      # manual|photo
    # Macros (calories only); nullable, grams per entry
    protein_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="trackers")


class AiMessage(Base):
    __tablename__ = "ai_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16))   # "user" или "ai"
    text: Mapped[str] = mapped_column(String(4096))
    image_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UpgradeIntent(Base):
    __tablename__ = "upgrade_intents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, unique=True)
    clicked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    remind_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")


class ConversationSummary(Base):
    __tablename__ = "conversation_summaries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    text: Mapped[str] = mapped_column(String(4096))
    covers_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class WorkoutMetricType(str, enum.Enum):
    strength = "strength"
    distance_time = "distance_time"
    duration_rounds = "duration_rounds"
    duration_only = "duration_only"


class WorkoutCategory(Base):
    __tablename__ = "workout_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    metric_type: Mapped[WorkoutMetricType] = mapped_column(Enum(WorkoutMetricType), nullable=False)
    item_label: Mapped[str | None] = mapped_column(String(64), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    items: Mapped[list["WorkoutItem"]] = relationship(back_populates="category")
    workouts: Mapped[list["Workout"]] = relationship(back_populates="category")


class WorkoutItem(Base):
    __tablename__ = "workout_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("workout_categories.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    category: Mapped["WorkoutCategory"] = relationship(back_populates="items")


class Workout(Base):
    __tablename__ = "workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("workout_categories.id"), nullable=False)
    duration_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    category: Mapped["WorkoutCategory"] = relationship(back_populates="workouts")
    entries: Mapped[list["WorkoutEntry"]] = relationship(back_populates="workout", cascade="all, delete-orphan")


class WorkoutEntry(Base):
    __tablename__ = "workout_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    workout_id: Mapped[int] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("workout_items.id", ondelete="SET NULL"), nullable=True)

    # strength
    weight_kg: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sets: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # distance_time & duration_rounds
    distance_m: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rounds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    workout: Mapped["Workout"] = relationship(back_populates="entries")
    item: Mapped["WorkoutItem | None"] = relationship()


class PromoCode(Base):
    __tablename__ = "promo_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    grant_type: Mapped[str] = mapped_column(String(16), nullable=False)        # "pro"
    grant_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    max_activations: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    used_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PromoActivation(Base):
    __tablename__ = "promo_activations"
    __table_args__ = (
        UniqueConstraint("promo_code_id", "user_id", name="uq_promo_activation"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    promo_code_id: Mapped[int] = mapped_column(
        ForeignKey("promo_codes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class HealthMetrics(Base):
    """Body composition snapshot written by the AI via [[HEALTH_METRICS:...]] marker."""
    __tablename__ = "health_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bmr: Mapped[float | None] = mapped_column(Float, nullable=True)
    bmi: Mapped[float | None] = mapped_column(Float, nullable=True)
    muscle_mass_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_mass_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    visceral_fat: Mapped[float | None] = mapped_column(Float, nullable=True)
    metabolic_age: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SavedMessage(Base):
    """AI message saved by the user as a programme/note."""
    __tablename__ = "saved_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class GcSubscription(Base):
    """GetCourse subscription record, keyed by normalised phone (10 digits)."""
    __tablename__ = "gc_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone_normalized: Mapped[str] = mapped_column(String(10), nullable=False, unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String, nullable=True)
    tier: Mapped[GcTier] = mapped_column(Enum(GcTier, name="gctier"), nullable=False)
    status: Mapped[GcStatus] = mapped_column(
        Enum(GcStatus, name="gcstatus"), nullable=False, server_default="active"
    )
    payed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    telegram_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
