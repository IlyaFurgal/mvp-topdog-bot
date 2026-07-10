"""add_nonpayer_intents

Revision ID: 0026_add_nonpayer_intents
Revises: 0025_checkin_restructure_companions
Create Date: 2026-07-10
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0026_add_nonpayer_intents"
down_revision: Union[str, None] = "0025_checkin_restructure_companions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "nonpayer_intents",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "clicked_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("remind_count", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_index("ix_nonpayer_intents_user_id", "nonpayer_intents", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_nonpayer_intents_user_id", table_name="nonpayer_intents")
    op.drop_table("nonpayer_intents")
