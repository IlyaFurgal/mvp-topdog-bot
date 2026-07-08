"""Registry of push videos: cache key -> (path relative to bot/, media_type).

media_type is "video" or "video_note" — video_note is what Telegram calls a
circle/round message and requires bot.send_video_note (not send_video).
"""
from pathlib import Path

_BOT_DIR = Path(__file__).resolve().parent

# key -> (relative_path, media_type)
PUSH_VIDEOS: dict[str, tuple[str, str]] = {
    "welcome_before_payment":  ("media/pushes/Видео - приветствие.mp4", "video"),
    "about_club":              ("media/pushes/О клубе.mp4", "video"),
    "circle_plus":             ("media/pushes/кружок плюс.mp4", "video_note"),
    "circle_pro":              ("media/pushes/кружок про.mp4", "video_note"),
    "nonpayer_24h_challenge":  ("media/pushes/weekly_challenge.mp4", "video"),
    "nonpayer_3d_final":       ("media/pushes/Amazing Red TopDog Final.mp4", "video"),
}


def resolve_path(key: str) -> Path:
    rel_path, _media_type = PUSH_VIDEOS[key]
    return _BOT_DIR / rel_path
