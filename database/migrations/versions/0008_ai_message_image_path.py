"""add image_path to ai_messages

Revision ID: 0008_ai_msg_image
Revises: 0007_reminder_times
Create Date: 2026-05-23 10:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_ai_msg_image"
down_revision: Union[str, None] = "0007_reminder_times"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "ai_messages",
        sa.Column("image_path", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("ai_messages", "image_path")
