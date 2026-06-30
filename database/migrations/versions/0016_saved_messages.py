"""add saved_messages table

Revision ID: 0016_saved_messages
Revises: 0015_health_metrics
Create Date: 2026-06-30
"""
from alembic import op
import sqlalchemy as sa

revision = '0016_saved_messages'
down_revision = '0015_health_metrics'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'saved_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_saved_messages_user_id', 'saved_messages', ['user_id'])
    op.create_index('ix_saved_messages_created_at', 'saved_messages', ['created_at'])


def downgrade() -> None:
    op.drop_table('saved_messages')
