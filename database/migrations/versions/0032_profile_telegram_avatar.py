"""add profiles.telegram_avatar_path

Caches the full-size Telegram profile photo (fetched via Bot API
getUserProfilePhotos/getFile) so the МОИ ДАННЫЕ avatar doesn't have to
render the small WebApp initData thumbnail (user.photo_url) upscaled and
blurry. NULL = not yet fetched, "" = fetched and user has no Telegram
photo, non-empty = local /uploads path.

Revision ID: 0032_profile_telegram_avatar
Revises: 0031_workout_user_edited
Create Date: 2026-07-17
"""
import sqlalchemy as sa
from alembic import op

revision = '0032_profile_telegram_avatar'
down_revision = '0031_workout_user_edited'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'profiles',
        sa.Column('telegram_avatar_path', sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('profiles', 'telegram_avatar_path')
