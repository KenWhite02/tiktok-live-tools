from dataclasses import dataclass, field
import os
from dotenv import load_dotenv

load_dotenv()


def _env_str(key: str, default: str) -> str:
    return os.environ.get(key, default).strip()


def _env_int(key: str, default: int) -> int:
    try:
        return int(os.environ.get(key, str(default)).strip())
    except (ValueError, TypeError):
        return default


@dataclass
class BridgeConfig:
    tikTokUsername: str = field(
        default_factory=lambda: _env_str("TIKTOK_USERNAME", "")
    )
    wsHost: str = field(default_factory=lambda: _env_str("WS_HOST", "127.0.0.1"))
    wsPort: int = field(default_factory=lambda: _env_int("WS_PORT", 9090))
    logLevel: str = field(
        default_factory=lambda: _env_str("LOG_LEVEL", "info").lower()
    )

    def __post_init__(self):
        if not self.tikTokUsername:
            raise ValueError(
                "TIKTOK_USERNAME is required. Set it in bridge/.env or environment."
            )
