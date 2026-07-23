from datetime import datetime, timezone

from database.models import SubscriptionStatus, User


def apply_subscription_to_user(
    user: User,
    tier: str | None,
    active: str,
    expires_at: datetime | None = None,
    activated_at: datetime | None = None,
) -> None:
    """Set the 4 User subscription fields consistently for payment and refund.

    Gating checks by_active (subscription_active=="active") OR by_status
    (subscription_status==premium) — both signals must move together, otherwise
    a stale legacy status="premium" alone would keep access open after a refund.

    The only place that should ever touch subscription_type/active/expires_at/
    status/activated_at — every activation path (webhook, promo code, phone
    binding) must go through this function, or subscription_activated_at stays
    NULL and _is_eligible_for_pushes silently drops the user from all reminders
    (ТЗ «не терять subscription_activated_at при активации через бота»,
    2026-07-22 — 81 of 137 active subscribers lost pushes this way in prod).
    """
    was_active = (user.subscription_active == "active")
    user.subscription_type = tier
    user.subscription_active = active
    user.subscription_expires_at = expires_at
    user.subscription_status = SubscriptionStatus.premium if active == "active" else SubscriptionStatus.free
    # Only stamp activation on the inactive/None → active transition, not on renewals
    if active == "active" and not was_active:
        user.subscription_activated_at = activated_at or datetime.now(timezone.utc)
