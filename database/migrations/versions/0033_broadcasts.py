"""add broadcasts table

Admin-triggered mass push to all active users (ТЗ «массовая рассылка
через админку», 2026-07-20). Enum created via the project's established
checkfirst=True pattern (see 0011_workouts / 0017_gc_subscriptions) —
declaring it standalone with create_type=False, then .create()'ing it
explicitly before op.create_table, avoids the DuplicateObject error that
comes from letting SQLAlchemy implicitly re-create the type a second
time when it's also referenced inline in a column definition.

Revision ID: 0033_broadcasts
Revises: 0032_profile_telegram_avatar
Create Date: 2026-07-20
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '0033_broadcasts'
down_revision = '0032_profile_telegram_avatar'
branch_labels = None
depends_on = None

broadcast_status = postgresql.ENUM(
    'pending', 'sending', 'done', 'failed',
    name='broadcaststatus', create_type=False,
)


def upgrade() -> None:
    broadcast_status.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'broadcasts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('status', postgresql.ENUM(name='broadcaststatus', create_type=False),
                  nullable=False, server_default='pending'),
        sa.Column('with_button', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('total', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('sent', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('failed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('blocked', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finished_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('broadcasts')
    op.execute(sa.text('DROP TYPE IF EXISTS broadcaststatus'))
