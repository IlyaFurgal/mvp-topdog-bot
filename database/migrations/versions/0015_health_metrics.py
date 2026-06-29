"""add health_metrics table

Revision ID: 0015_health_metrics
Revises: 0014_promo_codes
Create Date: 2026-06-29
"""
from alembic import op
import sqlalchemy as sa

revision = '0015_health_metrics'
down_revision = '0014_promo_codes'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'health_metrics',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('bmr', sa.Float(), nullable=True),
        sa.Column('bmi', sa.Float(), nullable=True),
        sa.Column('muscle_mass_kg', sa.Float(), nullable=True),
        sa.Column('fat_mass_kg', sa.Float(), nullable=True),
        sa.Column('visceral_fat', sa.Float(), nullable=True),
        sa.Column('metabolic_age', sa.Float(), nullable=True),
        sa.Column('body_fat_pct', sa.Float(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.text('now()')),
    )
    op.create_index('ix_health_metrics_user_id', 'health_metrics', ['user_id'])
    op.create_index('ix_health_metrics_recorded_at', 'health_metrics', ['recorded_at'])


def downgrade() -> None:
    op.drop_table('health_metrics')
