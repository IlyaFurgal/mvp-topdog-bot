"""add app visit tracking columns to users

Revision ID: 0018_app_visit_tracking
Revises: 0017_gc_subscriptions
Create Date: 2026-07-02
"""
import sqlalchemy as sa
from alembic import op

revision = '0018_app_visit_tracking'
down_revision = '0017_gc_subscriptions'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('subscription_activated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('first_app_open_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_app_open_at', sa.DateTime(timezone=True), nullable=True))

    # Backfill existing users — direct UPDATE (not ORM), so no bot/API code runs
    op.execute(sa.text("""
        UPDATE users
        SET first_app_open_at = created_at,
            last_app_open_at = now()
    """))
    op.execute(sa.text("""
        UPDATE users
        SET subscription_activated_at = created_at
        WHERE subscription_active = 'active'
    """))


def downgrade() -> None:
    op.drop_column('users', 'last_app_open_at')
    op.drop_column('users', 'first_app_open_at')
    op.drop_column('users', 'subscription_activated_at')
