"""Add notifications_enabled to profiles

Revision ID: 0012_notifications_enabled
Revises: 0011_workouts
Create Date: 2026-06-20
"""
from alembic import op
import sqlalchemy as sa

revision = '0012_notifications_enabled'
down_revision = '0011_workouts'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'profiles',
        sa.Column(
            'notifications_enabled',
            sa.Boolean(),
            nullable=False,
            server_default='true',
        ),
    )


def downgrade() -> None:
    op.drop_column('profiles', 'notifications_enabled')
