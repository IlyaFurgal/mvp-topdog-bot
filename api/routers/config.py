from fastapi import APIRouter

from core.config import settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/public")
async def public_config() -> dict:
    """Public endpoint — no auth required. Returns payment URLs for the landing page."""
    return {
        "getcourse_plus_url": settings.GETCOURSE_PLUS_URL or settings.GC_PAYMENT_URL_PLUS,
        "getcourse_pro_url": settings.GETCOURSE_PRO_URL or settings.GC_PAYMENT_URL_PRO,
        "subscription_plus_1m_price": settings.SUBSCRIPTION_PLUS_1M_PRICE,
        "subscription_plus_6m_price": settings.SUBSCRIPTION_PLUS_6M_PRICE,
        "subscription_pro_1m_price": settings.SUBSCRIPTION_PRO_1M_PRICE,
        "subscription_pro_6m_price": settings.SUBSCRIPTION_PRO_6M_PRICE,
    }
