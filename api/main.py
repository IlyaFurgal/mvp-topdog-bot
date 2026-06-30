import logging
import os

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.routers import admin, auth, checkins, config, debug, insights, profile, saved_messages, suvvy, trackers, webhooks, workouts
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
app.include_router(config.router, prefix="/api")
app.include_router(debug.router, prefix="/api")
app.include_router(workouts.router, prefix="/api")
app.include_router(saved_messages.router, prefix="/api")
app.include_router(admin.router)  # без prefix — пути /admin, /admin/users, ...

# Static uploads (images saved from AI chat)
os.makedirs("/app/uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="/app/uploads"), name="uploads")


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
