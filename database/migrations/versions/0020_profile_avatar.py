"""add avatar_path to profiles

Revision ID: 0020_profile_avatar
Revises: 0019_pulse_tracker
Create Date: 2026-07-03
"""
import sqlalchemy as sa
from alembic import op

revision = '0020_profile_avatar'
down_revision = '0019_pulse_tracker'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('profiles', sa.Column('avatar_path', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('profiles', 'avatar_path')
