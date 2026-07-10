"""add profiles.neat_level (replaces activity_level in calorie calc)

Revision ID: 0027_add_neat_level
Revises: 0026_add_nonpayer_intents
Create Date: 2026-07-10
"""
import sqlalchemy as sa
from alembic import op

revision = '0027_add_neat_level'
down_revision = '0026_add_nonpayer_intents'
branch_labels = None
depends_on = None

neat_level_enum = sa.Enum(
    'sedentary', 'moderate', 'active', 'very_active',
    name='neatlevel',
)


def upgrade() -> None:
    neat_level_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'profiles',
        sa.Column('neat_level', neat_level_enum, nullable=True),
    )

    # Backfill from the old training-frequency-derived activity_level, per
    # ТЗ «новая логика расчёта калорий» 2026-07-10:
    #   sedentary(1.2)    -> sedentary
    #   light(1.375)      -> moderate
    #   moderate(1.55)    -> moderate
    #   active(1.725)     -> active
    #   very_active(1.9)  -> very_active
    op.execute("""
        UPDATE profiles SET neat_level = CASE activity_level
            WHEN 'sedentary'    THEN 'sedentary'
            WHEN 'light'        THEN 'moderate'
            WHEN 'moderate'     THEN 'moderate'
            WHEN 'active'       THEN 'active'
            WHEN 'very_active'  THEN 'very_active'
            ELSE NULL
        END::neatlevel
        WHERE activity_level IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column('profiles', 'neat_level')
    neat_level_enum.drop(op.get_bind(), checkfirst=True)
