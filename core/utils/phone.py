import re


def normalize_phone(raw: str | None) -> str | None:
    """Return last 10 digits of a phone number (Russian format without country code).

    Accepts +7..., 8..., with spaces/dashes/parentheses.
    Returns None if fewer than 10 digits remain after stripping.
    """
    if not raw:
        return None
    digits = re.sub(r'\D', '', raw)
    if len(digits) < 10:
        return None
    return digits[-10:]
