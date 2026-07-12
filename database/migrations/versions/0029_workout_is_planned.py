"""add workouts.is_planned

Explicit plan-vs-fact flag on the workouts table. Until now a plan row
written by [[WORKOUT_PLANNED]] and a real logged workout were only told
apart by the heuristic rpe IS NULL AND category_id IS NULL — this makes
it a first-class column. Backfill marks existing rows matching that same
heuristic (rpe/category_id both NULL, note present — the AI-plan shape)
as planned; everything else (real logged workouts) stays False.

Revision ID: 0029_workout_is_planned
Revises: 0028_workout_rpe
Create Date: 2026-07-12
"""
import sqlalchemy as sa
from alembic import op

revision = '0029_workout_is_planned'
down_revision = '0028_workout_rpe'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'workouts',
        sa.Column('is_planned', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.execute(
        "UPDATE workouts SET is_planned = true "
        "WHERE rpe IS NULL AND category_id IS NULL AND note IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column('workouts', 'is_planned')
