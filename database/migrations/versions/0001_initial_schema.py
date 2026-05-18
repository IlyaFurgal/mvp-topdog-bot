"""initial_schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-05-18 00:00:00.000000

Single clean migration — creates all tables from scratch.
Replaces the two broken migrations that existed before.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Each ENUM type is declared once and reused in column definitions.
# SQLAlchemy will CREATE the type automatically on first create_table call
# that references it, and won't duplicate it (one type per table here).
subscriptionstatus = sa.Enum('free', 'premium', name='subscriptionstatus')
gender_enum        = sa.Enum('male', 'female', 'other', name='gender')
goal_enum          = sa.Enum('weight_loss', 'muscle_gain', 'maintenance', 'endurance', name='goal')
activitylevel_enum = sa.Enum('sedentary', 'light', 'moderate', 'active', 'very_active', name='activitylevel')
fitnesslevel_enum  = sa.Enum('beginner', 'intermediate', 'advanced', name='fitnesslevel')
tone_enum          = sa.Enum('aggressive', 'soft', name='tone')
checkintype_enum   = sa.Enum('morning', 'evening', 'post_workout', name='checkintype')
trackertype_enum   = sa.Enum('weight', 'water', 'sleep', name='trackertype')


def upgrade() -> None:
    # ── USERS ──────────────────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('telegram_id', sa.BigInteger(), nullable=False),
        sa.Column('username', sa.String(length=64), nullable=True),
        sa.Column('first_name', sa.String(length=128), nullable=True),
        sa.Column('email', sa.String(length=256), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False,
                  server_default=sa.text('true')),
        sa.Column('subscription_status', subscriptionstatus,
                  nullable=False, server_default='free'),
        sa.Column('subscription_type', sa.String(length=16), nullable=True),
        sa.Column('subscription_active', sa.String(length=16), nullable=True),
        sa.Column('subscription_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_users_telegram_id', 'users', ['telegram_id'], unique=True)
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # ── PROFILES ───────────────────────────────────────────────────────────
    op.create_table(
        'profiles',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('preferred_name', sa.String(length=64), nullable=True),
        sa.Column('gender', gender_enum, nullable=True),
        sa.Column('birth_date', sa.Date(), nullable=True),
        sa.Column('weight', sa.Float(), nullable=True),
        sa.Column('height', sa.Float(), nullable=True),
        sa.Column('goal', goal_enum, nullable=True),
        sa.Column('sport_type', sa.String(length=128), nullable=True),
        sa.Column('activity_level', activitylevel_enum, nullable=True),
        sa.Column('fitness_level', fitnesslevel_enum, nullable=True),
        sa.Column('workout_days_per_week', sa.Integer(), nullable=True),
        sa.Column('workout_hours_per_day', sa.Integer(), nullable=True),
        sa.Column('health_restrictions', sa.String(length=512), nullable=True),
        sa.Column('tone', tone_enum, nullable=False, server_default='soft'),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id'),
    )

    # ── CHECKINS ───────────────────────────────────────────────────────────
    op.create_table(
        'checkins',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', checkintype_enum, nullable=False),
        sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_checkins_user_id', 'checkins', ['user_id'], unique=False)

    # ── TRACKERS ───────────────────────────────────────────────────────────
    op.create_table(
        'trackers',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('type', trackertype_enum, nullable=False),
        sa.Column('value', sa.Float(), nullable=False),
        sa.Column('unit', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trackers_user_id', 'trackers', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_trackers_user_id', table_name='trackers')
    op.drop_table('trackers')

    op.drop_index('ix_checkins_user_id', table_name='checkins')
    op.drop_table('checkins')

    op.drop_table('profiles')

    op.drop_index('ix_users_email', table_name='users')
    op.drop_index('ix_users_telegram_id', table_name='users')
    op.drop_table('users')

    op.execute(sa.text("DROP TYPE IF EXISTS trackertype"))
    op.execute(sa.text("DROP TYPE IF EXISTS checkintype"))
    op.execute(sa.text("DROP TYPE IF EXISTS tone"))
    op.execute(sa.text("DROP TYPE IF EXISTS fitnesslevel"))
    op.execute(sa.text("DROP TYPE IF EXISTS activitylevel"))
    op.execute(sa.text("DROP TYPE IF EXISTS goal"))
    op.execute(sa.text("DROP TYPE IF EXISTS gender"))
    op.execute(sa.text("DROP TYPE IF EXISTS subscriptionstatus"))
