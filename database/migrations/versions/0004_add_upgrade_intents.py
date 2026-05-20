"""add_upgrade_intents

Revision ID: 0004_add_upgrade_intents
Revises: 0003_add_subscription_period
Create Date: 2026-05-20 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_add_upgrade_intents"
down_revision: Union[str, None] = "0003_add_subscription_period"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "upgrade_intents",
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
    op.create_index("ix_upgrade_intents_user_id", "upgrade_intents", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_upgrade_intents_user_id", table_name="upgrade_intents")
    op.drop_table("upgrade_intents")
