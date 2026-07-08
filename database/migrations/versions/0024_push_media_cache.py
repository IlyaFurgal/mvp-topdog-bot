"""push_media_cache — telegram file_id cache for push videos

Revision ID: 0024_push_media_cache
Revises: 0023_workout_category_nullable
Create Date: 2026-07-08
"""
import sqlalchemy as sa
from alembic import op

revision = '0024_push_media_cache'
down_revision = '0023_workout_category_nullable'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'push_media_cache',
        sa.Column('key', sa.String(length=64), primary_key=True),
        sa.Column('telegram_file_id', sa.String(), nullable=False),
        sa.Column('media_type', sa.String(length=20), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('push_media_cache')
