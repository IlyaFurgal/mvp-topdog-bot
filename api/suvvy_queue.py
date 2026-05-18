_queue: dict[str, list[str]] = {}


def push(chat_id: str, messages: list[str]) -> None:
    if chat_id not in _queue:
        _queue[chat_id] = []
    _queue[chat_id].extend(messages)


def pop(chat_id: str) -> list[str]:
    messages = _queue.pop(chat_id, [])
    return messages
