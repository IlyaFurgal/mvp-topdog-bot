"""add pulse to trackertype

Revision ID: 0019_pulse_tracker
Revises: 0018_app_visit_tracking
Create Date: 2026-07-03
"""
from alembic import op

revision = '0019_pulse_tracker'
down_revision = '0018_app_visit_tracking'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE trackertype ADD VALUE IF NOT EXISTS 'pulse'")


def downgrade() -> None:
    pass  # Postgres can't drop enum values; harmless to leave in place.
