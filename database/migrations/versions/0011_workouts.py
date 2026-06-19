"""add workout tables with seed data

Revision ID: 0011_workouts
Revises: 0010_conversation_summaries
Create Date: 2026-06-19 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = '0011_workouts'
down_revision: Union[str, None] = '0010_conversation_summaries'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

workout_metric = postgresql.ENUM(
    'strength', 'distance_time', 'duration_rounds', 'duration_only',
    name='workoutmetrictype',
    create_type=False,
)


def upgrade() -> None:
    workout_metric.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'workout_categories',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(32), nullable=False),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('metric_type', postgresql.ENUM(name='workoutmetrictype', create_type=False), nullable=False),
        sa.Column('item_label', sa.String(64), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code'),
    )

    op.create_table(
        'workout_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('is_custom', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['category_id'], ['workout_categories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_workout_items_category_id', 'workout_items', ['category_id'])

    op.create_table(
        'workouts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('category_id', sa.Integer(), nullable=False),
        sa.Column('duration_min', sa.Integer(), nullable=True),
        sa.Column('note', sa.String(2048), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['category_id'], ['workout_categories.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_workouts_user_id', 'workouts', ['user_id'])

    op.create_table(
        'workout_entries',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workout_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=True),
        sa.Column('weight_kg', sa.Numeric(8, 2), nullable=True),
        sa.Column('reps', sa.Integer(), nullable=True),
        sa.Column('sets', sa.Integer(), nullable=True),
        sa.Column('distance_m', sa.Integer(), nullable=True),
        sa.Column('time_sec', sa.Integer(), nullable=True),
        sa.Column('rounds', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['workout_id'], ['workouts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['workout_items.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_workout_entries_workout_id', 'workout_entries', ['workout_id'])

    # ── Seed workout_categories ─────────────────────────────────────────────
    op.execute("""
        INSERT INTO workout_categories (id, code, name, metric_type, item_label, sort_order) VALUES
        (1, 'gym',         'Зал',                    'strength',        'Упражнение',    1),
        (2, 'bodybuilding','Бодибилдинг',             'strength',        'Упражнение',    2),
        (3, 'fitness',     'Фитнес',                 'duration_only',   NULL,            3),
        (4, 'combat',      'Единоборства',            'duration_rounds', 'Вид',           4),
        (5, 'running',     'Бег',                    'distance_time',   'Поверхность',   5),
        (6, 'swimming',    'Плавание',               'distance_time',   'Стиль',         6),
        (7, 'team_sports', 'Игровые виды спорта',   'duration_only',   'Вид спорта',    7)
    """)

    # ── Seed workout_items ──────────────────────────────────────────────────
    # Gym exercises (shared with bodybuilding — duplicated for both category_ids)
    gym_exercises = [
        'Жим лёжа', 'Приседания со штангой', 'Становая тяга', 'Тяга штанги в наклоне',
        'Жим стоя / военный жим', 'Тяга блока к груди', 'Подтягивания', 'Отжимания на брусьях',
        'Жим гантелей на наклонной скамье', 'Сгибание рук с гантелями', 'Разгибание рук на блоке',
        'Гиперэкстензия', 'Скручивания', 'Планка', 'Жим ногами', 'Разведение гантелей лёжа',
        'Тяга гантели одной рукой', 'Шраги', 'Французский жим', 'Подъём гантелей через стороны',
        'Подъём ног в висе', 'Ягодичный мостик',
    ]
    gym_rows = []
    sort_i = 1
    for cat_id in (1, 2):
        for name in gym_exercises:
            gym_rows.append(f"({cat_id}, '{name.replace(chr(39), chr(39)+chr(39))}', false, NULL, {sort_i})")
            sort_i += 1

    op.execute(f"""
        INSERT INTO workout_items (category_id, name, is_custom, user_id, sort_order) VALUES
        {', '.join(gym_rows)}
    """)

    op.execute("""
        INSERT INTO workout_items (category_id, name, is_custom, user_id, sort_order) VALUES
        (4, 'Бокс',          false, NULL, 1),
        (4, 'Кикбоксинг',    false, NULL, 2),
        (4, 'Тайский бокс',  false, NULL, 3),
        (4, 'ММА',           false, NULL, 4),
        (4, 'Борьба',        false, NULL, 5),
        (4, 'Самбо',         false, NULL, 6),
        (4, 'Дзюдо',         false, NULL, 7),
        (4, 'БЖЖ',           false, NULL, 8),
        (5, 'Улица',         false, NULL, 1),
        (5, 'Беговая дорожка', false, NULL, 2),
        (5, 'Трейл',         false, NULL, 3),
        (5, 'Стадион',       false, NULL, 4),
        (6, 'Кроль',         false, NULL, 1),
        (6, 'Брасс',         false, NULL, 2),
        (6, 'Баттерфляй',    false, NULL, 3),
        (6, 'На спине',      false, NULL, 4),
        (6, 'Комплекс',      false, NULL, 5),
        (7, 'Футбол',        false, NULL, 1),
        (7, 'Баскетбол',     false, NULL, 2),
        (7, 'Волейбол',      false, NULL, 3),
        (7, 'Теннис',        false, NULL, 4),
        (7, 'Хоккей',        false, NULL, 5),
        (7, 'Бадминтон',     false, NULL, 6),
        (7, 'Настольный теннис', false, NULL, 7)
    """)


def downgrade() -> None:
    op.drop_index('ix_workout_entries_workout_id', table_name='workout_entries')
    op.drop_table('workout_entries')
    op.drop_index('ix_workouts_user_id', table_name='workouts')
    op.drop_table('workouts')
    op.drop_index('ix_workout_items_category_id', table_name='workout_items')
    op.drop_table('workout_items')
    op.drop_table('workout_categories')
    workout_metric.drop(op.get_bind(), checkfirst=True)
