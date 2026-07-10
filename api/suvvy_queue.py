import logging
import time

logger = logging.getLogger(__name__)

# chat_id -> [(pushed_at_unix, text), ...]
_queue: dict[str, list[tuple[float, str]]] = {}


def push(chat_id: str, messages: list[str]) -> None:
    now = time.time()
    _queue.setdefault(chat_id, []).extend((now, m) for m in messages)


def pop(chat_id: str, since: float | None = None) -> list[str]:
    """Pop and return queued replies for chat_id.

    If `since` (unix timestamp) is given, only replies pushed at/after
    that moment are returned — anything older is dropped rather than
    risk being shown as the answer to a newer question. This is the fix
    for the "ответ не в такт" bug: the frontend's local wait for a given
    outgoing message times out after 60s and gives up; if Suvvy's reply
    for THAT abandoned request then lands after the user has already
    sent a new message, without this cutoff it would surface attached to
    the new question instead of the one it actually answers. See ТЗ
    «пул правок» 2026-07-10, п.2/7/13.
    """
    all_msgs = _queue.pop(chat_id, [])
    if since is None:
        return [text for _, text in all_msgs]

    fresh = [text for ts, text in all_msgs if ts >= since]
    stale = [ts for ts, _ in all_msgs if ts < since]
    if stale:
        logger.info(
            "suvvy_queue: dropped %d stale repl(y/ies) for chat_id=%s "
            "(pushed before since=%.3f; oldest stale ts=%.3f)",
            len(stale), chat_id, since, min(stale),
        )
    return fresh
