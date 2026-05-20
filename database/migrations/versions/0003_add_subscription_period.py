"""add_subscription_period

Revision ID: 0003_add_subscription_period
Revises: 0002_add_ai_messages
Create Date: 2026-05-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_add_subscription_period"
down_revision: Union[str, None] = "0002_add_ai_messages"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("subscription_period", sa.String(16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "subscription_period")
