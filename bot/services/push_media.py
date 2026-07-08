"""Send push videos (bot.media_registry.PUSH_VIDEOS) with a Telegram
file_id cache: the first send for a given key uploads the local file and
stores the file_id Telegram hands back; every send after that reuses the
cached id instead of re-uploading the file.
"""
import asyncio
import logging
import tempfile
from pathlib import Path

from aiogram import Bot
from aiogram.types import FSInputFile
from sqlalchemy import select

from bot.media_registry import PUSH_VIDEOS, resolve_path
from database.models import PushMediaCache
from database.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


async def _get_cached_file_id(key: str) -> str | None:
    async with AsyncSessionLocal() as session:
        row = (await session.execute(
            select(PushMediaCache).where(PushMediaCache.key == key)
        )).scalar_one_or_none()
        return row.telegram_file_id if row else None


async def _store_file_id(key: str, file_id: str, media_type: str) -> None:
    async with AsyncSessionLocal() as session:
        existing = (await session.execute(
            select(PushMediaCache).where(PushMediaCache.key == key)
        )).scalar_one_or_none()
        if existing:
            existing.telegram_file_id = file_id
            existing.media_type = media_type
        else:
            session.add(PushMediaCache(key=key, telegram_file_id=file_id, media_type=media_type))
        await session.commit()


async def _probe_dimensions(path: Path) -> tuple[int, int] | None:
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height",
            "-of", "csv=s=x:p=0", str(path),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            logger.warning("ffprobe failed for %s: %s", path, stderr.decode(errors="ignore")[:200])
            return None
        w_str, h_str = stdout.decode().strip().split("x")
        return int(w_str), int(h_str)
    except Exception as exc:
        logger.warning("ffprobe error for %s: %s", path, exc)
        return None


async def _ensure_square(path: Path) -> tuple[Path, bool]:
    """video_note requires a square (1:1) video, or Telegram crops it badly
    on its own. Probes the file; if not square, center-crops via ffmpeg
    (ffmpeg's crop=w:h defaults to a centered crop) into a temp file and
    returns that instead. Falls back to the original path unchanged on any
    probe/crop failure, so a bad crop never blocks the send. Second return
    value is True when a temp file was created (caller should clean it up).
    """
    dims = await _probe_dimensions(path)
    if not dims:
        return path, False
    width, height = dims
    if width == height:
        return path, False

    side = min(width, height)
    tmp_path = Path(tempfile.gettempdir()) / f"square_{path.stem}.mp4"
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-y", "-i", str(path),
            "-vf", f"crop={side}:{side}",
            "-c:a", "copy",
            str(tmp_path),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0 or not tmp_path.exists():
            logger.warning("ffmpeg crop failed for %s: %s", path, stderr.decode(errors="ignore")[:200])
            return path, False
        logger.info("Cropped %s (%dx%d) to square %dx%d for video_note", path.name, width, height, side, side)
        return tmp_path, True
    except Exception as exc:
        logger.warning("ffmpeg crop error for %s: %s", path, exc)
        return path, False


async def send_push_video(bot: Bot, chat_id: int, key: str) -> bool:
    """Send a registered push video to chat_id. Returns True on success."""
    if key not in PUSH_VIDEOS:
        logger.error("send_push_video: unknown key %r", key)
        return False

    _rel_path, media_type = PUSH_VIDEOS[key]
    cached_file_id = await _get_cached_file_id(key)

    try:
        if cached_file_id:
            if media_type == "video_note":
                await bot.send_video_note(chat_id=chat_id, video_note=cached_file_id)
            else:
                await bot.send_video(chat_id=chat_id, video=cached_file_id)
            return True

        path = resolve_path(key)
        if not path.exists():
            logger.error("send_push_video: file not found for key %r at %s", key, path)
            return False

        upload_path, is_temp = (
            await _ensure_square(path) if media_type == "video_note" else (path, False)
        )
        try:
            if media_type == "video_note":
                message = await bot.send_video_note(chat_id=chat_id, video_note=FSInputFile(upload_path))
                new_file_id = message.video_note.file_id
            else:
                message = await bot.send_video(chat_id=chat_id, video=FSInputFile(upload_path))
                new_file_id = message.video.file_id
        finally:
            if is_temp:
                upload_path.unlink(missing_ok=True)

        await _store_file_id(key, new_file_id, media_type)
        return True
    except Exception as exc:
        logger.error("send_push_video: failed to send %r to %s: %s", key, chat_id, exc)
        return False
