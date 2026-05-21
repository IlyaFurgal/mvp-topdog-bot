"""add goals, timezone, push_time to profiles; add calories to trackertype

Revision ID: 0006_goals_timezone_pushtime_calories
Revises: 0005_rename_subscription_types
Create Date: 2026-05-21 14:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0006_goals_timezone_pushtime_calories"
down_revision: Union[str, None] = "0005_rename_subscription_types"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. New columns on profiles
    op.add_column("profiles", sa.Column("goals", postgresql.JSONB(), nullable=True))
    op.add_column("profiles", sa.Column("timezone", sa.String(64), nullable=True))
    op.add_column("profiles", sa.Column("push_time", sa.String(5), nullable=True))

    # 2. Migrate existing single goal → goals array
    op.execute(
        "UPDATE profiles SET goals = to_jsonb(ARRAY[goal::text]) "
        "WHERE goal IS NOT NULL AND goals IS NULL"
    )

    # 3. Add 'calories' value to the PostgreSQL trackertype enum
    op.execute("ALTER TYPE trackertype ADD VALUE IF NOT EXISTS 'calories'")


def downgrade() -> None:
    op.drop_column("profiles", "push_time")
    op.drop_column("profiles", "timezone")
    op.drop_column("profiles", "goals")
    # Note: removing an enum value from PostgreSQL requires recreating the type — skip for safety
