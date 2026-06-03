"""add meal_type, label, source to trackers

Revision ID: 0009_meal_fields
Revises: 0008_ai_msg_image
Create Date: 2026-06-03 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = '0009_meal_fields'
down_revision: Union[str, None] = '0008_ai_msg_image'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('trackers', sa.Column('meal_type', sa.String(16), nullable=True))
    op.add_column('trackers', sa.Column('label',     sa.String(256), nullable=True))
    op.add_column('trackers', sa.Column('source',    sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column('trackers', 'source')
    op.drop_column('trackers', 'label')
    op.drop_column('trackers', 'meal_type')
