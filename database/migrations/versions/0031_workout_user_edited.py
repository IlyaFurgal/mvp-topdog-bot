"""add workouts.user_edited

Flags a workout row as manually edited by the user via PUT /workouts/{id}.
The Suvvy webhook upserts AI-parsed [[WORKOUT_PLANNED]]/[[WORKOUT]] markers
by (user, date, is_planned), overwriting note/duration_min/rpe in place any
time the AI chat mentions that date again — including after the user had
already corrected that same row by hand, silently reverting their edit.
This column lets the webhook skip rows the user has touched instead.

Revision ID: 0031_workout_user_edited
Revises: 0030_phone_e164
Create Date: 2026-07-17
"""
import sqlalchemy as sa
from alembic import op

revision = '0031_workout_user_edited'
down_revision = '0030_phone_e164'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'workouts',
        sa.Column('user_edited', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    op.drop_column('workouts', 'user_edited')
