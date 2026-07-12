"""widen gc_subscriptions.phone_normalized to E.164

normalize_phone() used to return digits[-10:], silently dropping the
country code — foreign numbers turned into bogus RU-shaped ones (prod
issue 2026-07-12: +44 7871 909099 became 7871909099). The new
normalize_phone() returns full E.164 digits (11-15 chars), so the
column needs to hold more than 10 chars. Widening varchar(10) ->
varchar(20) is a metadata-only change in Postgres (no table rewrite,
existing UNIQUE constraint / index on the column stay valid).

Existing rows are all 10-digit RU numbers stored without the country
code (the old normalize_phone's output) — backfilled with a '7' prefix
so they match what the new normalize_phone() produces for the same
number, instead of silently failing to match on the next phone check.

Revision ID: 0030_phone_e164
Revises: 0029_workout_is_planned
Create Date: 2026-07-12
"""
import sqlalchemy as sa
from alembic import op

revision = '0030_phone_e164'
down_revision = '0029_workout_is_planned'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'gc_subscriptions', 'phone_normalized',
        type_=sa.String(20),
        existing_type=sa.String(10),
        existing_nullable=False,
    )
    # All existing rows are 10-digit RU numbers without the country code.
    op.execute("""
        UPDATE gc_subscriptions
        SET phone_normalized = '7' || phone_normalized
        WHERE length(phone_normalized) = 10;
    """)


def downgrade() -> None:
    op.execute("""
        UPDATE gc_subscriptions
        SET phone_normalized = substring(phone_normalized from 2)
        WHERE length(phone_normalized) = 11
          AND phone_normalized LIKE '7%';
    """)
    op.alter_column(
        'gc_subscriptions', 'phone_normalized',
        type_=sa.String(10),
        existing_type=sa.String(20),
        existing_nullable=False,
    )
