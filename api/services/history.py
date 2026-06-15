"""
History management: fold old ai_messages into conversation_summaries
instead of deleting them, preserving long-term dialogue memory.
"""
import asyncio
import logging

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import AiMessage, ConversationSummary
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)
MAX_HISTORY = 20
_BG_TASKS: set[asyncio.Task] = set()


async def fold_history(user_id: int) -> None:
    """
    Fold oldest ai_messages that exceed MAX_HISTORY into conversation_summaries,
    then delete them. Creates its own session and transaction.
    Errors are logged only — never propagated to the caller.
    """
    try:
        async with AsyncSessionLocal() as session:
            async with session.begin():
                # Count total messages for user
                count_res = await session.execute(
                    select(func.count()).select_from(AiMessage)
                    .where(AiMessage.user_id == user_id)
                )
                total: int = count_res.scalar_one()

                if total <= MAX_HISTORY:
                    return

                excess = total - MAX_HISTORY

                # Fetch oldest messages to fold
                old_res = await session.execute(
                    select(AiMessage)
                    .where(AiMessage.user_id == user_id)
                    .order_by(AiMessage.created_at.asc())
                    .limit(excess)
                )
                old_msgs = old_res.scalars().all()

                if not old_msgs:
                    return

                covers_until = old_msgs[-1].created_at

                # Build summary fragment (deterministic, compact)
                # TODO: заменить на LLM-свёртку для качественного сжатия
                lines = []
                for m in old_msgs:
                    prefix = "Пользователь" if m.role == "user" else "ИИ"
                    lines.append(f"{prefix}: {m.text[:150]}")
                new_fragment = "\n".join(lines)

                # Append to existing summary or create new one
                existing_res = await session.execute(
                    select(ConversationSummary)
                    .where(ConversationSummary.user_id == user_id)
                    .order_by(ConversationSummary.created_at.desc())
                    .limit(1)
                )
                existing = existing_res.scalar_one_or_none()

                if existing:
                    combined = f"{existing.text}\n---\n{new_fragment}"
                    existing.text = combined[-4096:]
                    existing.covers_until = covers_until
                else:
                    session.add(ConversationSummary(
                        user_id=user_id,
                        text=new_fragment[-4096:],
                        covers_until=covers_until,
                    ))

                # Delete folded messages
                old_ids = [m.id for m in old_msgs]
                await session.execute(
                    delete(AiMessage).where(AiMessage.id.in_(old_ids))
                )

                # Log profile update candidates (do not auto-write)
                _log_profile_candidates(user_id, old_msgs)

                logger.info(
                    "fold_history: user_id=%s folded %d msg(s) covers_until=%s",
                    user_id, len(old_msgs), covers_until,
                )

    except Exception as exc:
        logger.error("fold_history error user_id=%s: %s", user_id, exc)


def schedule_fold(user_id: int) -> None:
    """Schedule fold_history as a background asyncio task (fire-and-forget)."""
    task = asyncio.create_task(fold_history(user_id))
    _BG_TASKS.add(task)
    task.add_done_callback(_BG_TASKS.discard)


# ── Profile update candidate logger ─────────────────────────────────────────

_PROFILE_KEYWORDS = [
    "травм", "болит", "боль", "реабилитац",
    "изменил цель", "новая цель", "сменил цель",
    "похудел", "набрал",
    "теперь тренируюсь",
]


def _log_profile_candidates(user_id: int, messages: list) -> None:
    """
    Scan folded messages for keywords that suggest profile facts have changed.
    Logs candidates only — does NOT auto-update Profile.
    # TODO: подтверждение обновления профиля через UI или admin-endpoint
    """
    hits = []
    for m in messages:
        if m.role != "user":
            continue
        text_lower = m.text.lower()
        for kw in _PROFILE_KEYWORDS:
            if kw in text_lower:
                hits.append(m.text[:100])
                break

    if hits:
        logger.info(
            "profile_candidate user_id=%s: possible profile changes detected in %d message(s): %s",
            user_id, len(hits), hits,
        )
