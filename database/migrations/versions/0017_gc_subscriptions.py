"""add gc_subscriptions table

Revision ID: 0017_gc_subscriptions
Revises: 0016_saved_messages
Create Date: 2026-06-30
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0017_gc_subscriptions'
down_revision = '0016_saved_messages'
branch_labels = None
depends_on = None

gc_tier = postgresql.ENUM('plus', 'pro', name='gctier', create_type=False)
gc_status = postgresql.ENUM('active', 'cancelled', name='gcstatus', create_type=False)


def upgrade() -> None:
    gc_tier.create(op.get_bind(), checkfirst=True)
    gc_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'gc_subscriptions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('phone_normalized', sa.String(10), nullable=False),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('tier', postgresql.ENUM(name='gctier', create_type=False), nullable=False),
        sa.Column('status', postgresql.ENUM(name='gcstatus', create_type=False),
                  nullable=False, server_default='active'),
        sa.Column('payed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('telegram_id', sa.BigInteger(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.UniqueConstraint('phone_normalized', name='uq_gc_subscriptions_phone'),
        sa.UniqueConstraint('telegram_id', name='uq_gc_subscriptions_telegram_id'),
    )
    op.create_index('ix_gc_subscriptions_phone_normalized', 'gc_subscriptions', ['phone_normalized'])


def downgrade() -> None:
    op.drop_table('gc_subscriptions')
    op.execute(sa.text('DROP TYPE IF EXISTS gctier'))
    op.execute(sa.text('DROP TYPE IF EXISTS gcstatus'))
