from fastapi import APIRouter

from core.config import settings

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/public")
async def public_config() -> dict:
    """Public endpoint — no auth required. Returns payment URLs for the landing page."""
    return {
        "getcourse_ai_url": settings.GETCOURSE_AI_URL or settings.GC_PAYMENT_URL_AI,
        "getcourse_mvp_url": settings.GETCOURSE_MVP_URL or settings.GC_PAYMENT_URL_MVP,
        "subscription_ai_1m_price": settings.SUBSCRIPTION_AI_1M_PRICE,
        "subscription_ai_6m_price": settings.SUBSCRIPTION_AI_6M_PRICE,
        "subscription_mvp_1m_price": settings.SUBSCRIPTION_MVP_1M_PRICE,
        "subscription_mvp_6m_price": settings.SUBSCRIPTION_MVP_6M_PRICE,
    }
