"""add_ai_messages

Revision ID: 0002_add_ai_messages
Revises: 0001_initial_schema
Create Date: 2026-05-19 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_add_ai_messages"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_messages",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("text", sa.String(4096), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_ai_messages_user_id", "ai_messages", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_messages_user_id", table_name="ai_messages")
    op.drop_table("ai_messages")
