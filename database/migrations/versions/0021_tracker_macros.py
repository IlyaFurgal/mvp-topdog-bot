"""add protein/fat/carbs grams to trackers

Revision ID: 0021_tracker_macros
Revises: 0020_profile_avatar
Create Date: 2026-07-03
"""
import sqlalchemy as sa
from alembic import op

revision = '0021_tracker_macros'
down_revision = '0020_profile_avatar'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('trackers', sa.Column('protein_g', sa.Float(), nullable=True))
    op.add_column('trackers', sa.Column('fat_g', sa.Float(), nullable=True))
    op.add_column('trackers', sa.Column('carbs_g', sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column('trackers', 'carbs_g')
    op.drop_column('trackers', 'fat_g')
    op.drop_column('trackers', 'protein_g')
