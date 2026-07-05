"""make workouts.category_id nullable

AI-planned workouts (via [[WORKOUT_PLANNED]] marker) are no longer tied
to a sport category — the whole day's plan is written as free-form text
into Workout.note. Manual entry is also moving to a category-free unified
exercise list. category_id becomes optional; DROP NOT NULL is a safe,
non-destructive constraint relaxation (no data rewrite needed).

Revision ID: 0023_workout_category_nullable
Revises: 0022_ai_message_text_unbounded
Create Date: 2026-07-06
"""
import sqlalchemy as sa
from alembic import op

revision = '0023_workout_category_nullable'
down_revision = '0022_ai_message_text_unbounded'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'workouts', 'category_id',
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    # NOTE: downgrade will fail if any existing rows have category_id IS NULL.
    op.alter_column(
        'workouts', 'category_id',
        existing_type=sa.Integer(),
        nullable=False,
    )
