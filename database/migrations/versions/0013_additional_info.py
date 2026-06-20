"""Add additional_info to profiles

Revision ID: 0013_additional_info
Revises: 0012_notifications_enabled
Create Date: 2026-06-20
"""
from alembic import op
import sqlalchemy as sa

revision = '0013_additional_info'
down_revision = '0012_notifications_enabled'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'profiles',
        sa.Column('additional_info', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('profiles', 'additional_info')
