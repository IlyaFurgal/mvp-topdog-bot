from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routers import auth, checkins, insights, profile, suvvy, trackers, webhooks
from database.models import User
from database.session import get_session

app = FastAPI(title="TopDog API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(checkins.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(trackers.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(suvvy.router, prefix="/api")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/users")
async def list_users(session: AsyncSession = Depends(get_session)) -> list[dict]:
    result = await session.execute(select(User))
    users = result.scalars().all()
    return [
        {
            "id": u.id,
            "telegram_id": u.telegram_id,
            "username": u.username,
            "first_name": u.first_name,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "is_active": u.is_active,
            "subscription_status": u.subscription_status,
        }
        for u in users
    ]
