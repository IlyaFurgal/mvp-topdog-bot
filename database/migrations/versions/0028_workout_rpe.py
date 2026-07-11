"""add workouts.rpe

Revision ID: 0028_workout_rpe
Revises: 0027_add_neat_level
Create Date: 2026-07-10
"""
import sqlalchemy as sa
from alembic import op

revision = '0028_workout_rpe'
down_revision = '0027_add_neat_level'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'workouts',
        sa.Column('rpe', sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('workouts', 'rpe')
