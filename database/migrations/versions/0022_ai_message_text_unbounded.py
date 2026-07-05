"""widen ai_messages.text from varchar(4096) to unbounded text

Long AI replies (e.g. full training programs) exceeded the old
VARCHAR(4096) limit, which Postgres rejects at INSERT/COMMIT time with
an uncaught DataError -> unhandled 500 on POST /api/webhooks/suvvy/.

Revision ID: 0022_ai_message_text_unbounded
Revises: 0021_tracker_macros
Create Date: 2026-07-04
"""
import sqlalchemy as sa
from alembic import op

revision = '0022_ai_message_text_unbounded'
down_revision = '0021_tracker_macros'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # VARCHAR -> TEXT is a safe, non-destructive widening; no data rewrite needed.
    op.alter_column(
        'ai_messages', 'text',
        existing_type=sa.String(length=4096),
        type_=sa.Text(),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        'ai_messages', 'text',
        existing_type=sa.Text(),
        type_=sa.String(length=4096),
        existing_nullable=False,
    )
