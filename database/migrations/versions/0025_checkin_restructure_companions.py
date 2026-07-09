"""companion fields for checkin restructure — resting_pulse toggle, workout planned_time

Revision ID: 0025_checkin_restructure_companions
Revises: 0024_push_media_cache
Create Date: 2026-07-09
"""
import sqlalchemy as sa
from alembic import op

revision = '0025_checkin_restructure_companions'
down_revision = '0024_push_media_cache'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'profiles',
        sa.Column('resting_pulse_enabled', sa.Boolean(), nullable=False, server_default='false'),
    )
    op.add_column(
        'workouts',
        sa.Column('planned_time', sa.String(length=5), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('workouts', 'planned_time')
    op.drop_column('profiles', 'resting_pulse_enabled')
