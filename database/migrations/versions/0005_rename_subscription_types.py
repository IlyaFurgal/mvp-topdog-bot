"""rename_subscription_types: ai->plus, mvp->pro

Revision ID: 0005_rename_subscription_types
Revises: 0004_add_upgrade_intents
Create Date: 2026-05-21 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005_rename_subscription_types"
down_revision: Union[str, None] = "0004_add_upgrade_intents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET subscription_type = 'plus' WHERE subscription_type = 'ai'")
    op.execute("UPDATE users SET subscription_type = 'pro'  WHERE subscription_type = 'mvp'")


def downgrade() -> None:
    op.execute("UPDATE users SET subscription_type = 'ai'  WHERE subscription_type = 'plus'")
    op.execute("UPDATE users SET subscription_type = 'mvp' WHERE subscription_type = 'pro'")
