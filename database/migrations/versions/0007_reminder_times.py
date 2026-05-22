"""add morning_reminder_time and evening_reminder_time to profiles

Revision ID: 0007_reminder_times
Revises: 0006_profile_extras
Create Date: 2026-05-22 12:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_reminder_times"
down_revision: Union[str, None] = "0006_profile_extras"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("morning_reminder_time", sa.String(5), nullable=True, server_default="08:00"))
    op.add_column("profiles", sa.Column("evening_reminder_time", sa.String(5), nullable=True, server_default="21:00"))
    # Also widen timezone column from varchar(64) to varchar(16) — actually keep at 64 for tz names
    # but the new schema uses "UTC+3" style (max ~7 chars). Widen is safe; no change needed.


def downgrade() -> None:
    op.drop_column("profiles", "evening_reminder_time")
    op.drop_column("profiles", "morning_reminder_time")
