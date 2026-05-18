import hashlib
import hmac
import json
from datetime import datetime, timedelta
from urllib.parse import parse_qsl, unquote

from fastapi import APIRouter, Depends, HTTPException
import jwt
from jwt.exceptions import InvalidTokenError
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from database.crud import get_user_by_telegram_id
from database.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])

_ALGORITHM = "HS256"
_TOKEN_EXPIRE_HOURS = 24


# ── Schemas ───────────────────────────────────────────────────────────────────

class TelegramAuthRequest(BaseModel):
    init_data: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    telegram_id: int
    username: str | None
    first_name: str | None
    is_active: bool


# ── Helpers ───────────────────────────────────────────────────────────────────

def _verify_init_data(init_data: str) -> dict:
    """Verify Telegram WebApp initData signature (HMAC-SHA256)."""
    params = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)

    if not received_hash:
        raise HTTPException(status_code=400, detail="Missing hash in initData")

    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    secret_key = hmac.new(
        b"WebAppData",
        settings.BOT_TOKEN.encode(),
        hashlib.sha256,
    ).digest()

    expected_hash = hmac.new(
        secret_key,
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=401, detail="Invalid initData signature")

    user_json = params.get("user", "{}")
    return json.loads(unquote(user_json))


def _create_token(telegram_id: int) -> str:
    expire = datetime.utcnow() + timedelta(hours=_TOKEN_EXPIRE_HOURS)
    return jwt.encode(
        {"sub": str(telegram_id), "exp": expire},
        settings.JWT_SECRET,
        algorithm=_ALGORITHM,
    )


def _decode_token(token: str) -> int:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[_ALGORITHM])
        return int(payload["sub"])
    except (InvalidTokenError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/telegram", response_model=TokenResponse)
async def auth_telegram(
    body: TelegramAuthRequest,
    session: AsyncSession = Depends(get_session),
):
    user_data = _verify_init_data(body.init_data)
    telegram_id = user_data.get("id")

    if not telegram_id:
        raise HTTPException(status_code=400, detail="No user id in initData")

    user = await get_user_by_telegram_id(session, telegram_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found — complete bot registration first")

    return TokenResponse(access_token=_create_token(telegram_id))


@router.get("/me", response_model=UserResponse)
async def get_me(
    session: AsyncSession = Depends(get_session),
    # Simplified: pass token via query param for now; move to Bearer header later
    token: str = "",
):
    telegram_id = _decode_token(token)
    user = await get_user_by_telegram_id(session, telegram_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(
        telegram_id=user.telegram_id,
        username=user.username,
        first_name=user.first_name,
        is_active=user.is_active,
    )
