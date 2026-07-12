import re


def normalize_phone(raw: str | None) -> str | None:
    """Normalize a phone number to E.164 digits (no leading '+').

    Rules:
      8XXXXXXXXXX  (11 digits, RU domestic)  -> 7XXXXXXXXXX
      7XXXXXXXXXX  (11 digits, RU/KZ)        -> as-is
      XXXXXXXXXX   (10 digits, no country)   -> 7XXXXXXXXXX  (assume RU)
      11..15 digits, any other prefix        -> as-is (foreign)
      < 10 or > 15 digits                    -> None

    Previously returned digits[-10:], which silently dropped the country code
    and turned foreign numbers into bogus RU ones (prod issue 2026-07-12:
    +44 7871 909099 became 7871909099).
    """
    if not raw:
        return None
    digits = re.sub(r'\D', '', raw)
    if len(digits) == 11 and digits.startswith('8'):
        return '7' + digits[1:]
    if len(digits) == 10:
        return '7' + digits
    if 10 < len(digits) <= 15:
        return digits
    return None
