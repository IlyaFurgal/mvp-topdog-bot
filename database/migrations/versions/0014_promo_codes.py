"""add promo_codes and promo_activations tables

Revision ID: 0014_promo_codes
Revises: 0013_additional_info
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = '0014_promo_codes'
down_revision = '0013_additional_info'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'promo_codes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('code', sa.String(64), nullable=False, unique=True),
        sa.Column('grant_type', sa.String(16), nullable=False),
        sa.Column('grant_days', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('max_activations', sa.Integer(), nullable=False, server_default='30'),
        sa.Column('used_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_promo_codes_code', 'promo_codes', ['code'])

    op.create_table(
        'promo_activations',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('promo_code_id', sa.Integer(),
                  sa.ForeignKey('promo_codes.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('activated_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
        sa.UniqueConstraint('promo_code_id', 'user_id', name='uq_promo_activation'),
    )
    op.create_index('ix_promo_activations_promo_code_id', 'promo_activations', ['promo_code_id'])
    op.create_index('ix_promo_activations_user_id', 'promo_activations', ['user_id'])


def downgrade() -> None:
    op.drop_table('promo_activations')
    op.drop_table('promo_codes')
