"""
TikTokLive Bridge — connects to TikTok Live and forwards events
to a Node.js application via WebSocket.

Usage:
    TIKTOK_USERNAME=your_username python3 bridge/server.py

Requires: TikTokLive, websockets, python-dotenv
"""

import asyncio
import json
import logging
import sys
from typing import Any

import websockets
from TikTokLive import TikTokLiveClient
from TikTokLive.events import (
    CommentEvent,
    ConnectEvent,
    DisconnectEvent,
    FollowEvent,
    GiftEvent,
    LikeEvent,
    ShareEvent,
    JoinEvent,
)

from config import BridgeConfig

# ---------------------------------------------------------------------------
# Logging setup
# ---------------------------------------------------------------------------

LOG_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}

logging.basicConfig(
    level=LOG_LEVELS.get(BridgeConfig().logLevel, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("tiktok-bridge")

# Backoff bounds (seconds) for reconnecting to the Node.js WebSocket server
RECONNECT_MIN_DELAY = 1
RECONNECT_MAX_DELAY = 10


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------

def _chat_payload(event: CommentEvent, host_username: str) -> dict[str, Any]:
    user = event.user
    # The stream owner has no moderator badge, so match them by username
    is_host = (user.username or "").lower() == host_username.lstrip("@").lower()
    return {
        "type": "chat",
        "userId": str(user.id),
        "uniqueId": user.username,
        "nickname": user.nick_name,
        "message": event.comment,
        "userRole": user.user_role,
        "isModerator": is_host or user.is_moderator,
    }


def _gift_payload(event: GiftEvent) -> dict[str, Any]:
    return {
        "type": "gift",
        "giftName": event.gift.name,
        "giftId": event.gift.id,
        "repeatCount": event.repeat_count,
        "diamondCost": event.gift.diamond_count,
        "userId": str(event.user.id),
        "uniqueId": event.user.username,
        "nickname": event.user.nick_name,
    }


def _like_payload(event: LikeEvent) -> dict[str, Any]:
    return {
        "type": "like",
        "count": event.count,
        "total": event.total,
        "userId": str(event.user.id),
        "uniqueId": event.user.username,
        "nickname": event.user.nick_name,
    }


def _follow_payload(event: FollowEvent) -> dict[str, Any]:
    return {
        "type": "follow",
        "userId": str(event.user.id),
        "uniqueId": event.user.username,
        "nickname": event.user.nick_name,
    }


def _share_payload(event: ShareEvent) -> dict[str, Any]:
    return {
        "type": "share",
        "userId": str(event.user.id),
        "uniqueId": event.user.username,
        "nickname": event.user.nick_name,
    }


def _join_payload(event: JoinEvent) -> dict[str, Any]:
    return {
        "type": "join",
        "userId": str(event.user.id),
        "uniqueId": event.user.username,
        "nickname": event.user.nick_name,
    }


# ---------------------------------------------------------------------------
# Bridge runner
# ---------------------------------------------------------------------------


class TikTokBridge:
    """Runs a TikTokLive client and forwards events over a WebSocket connection."""

    def __init__(self, config: BridgeConfig) -> None:
        self.config = config
        self.ws_url = f"ws://{config.wsHost}:{config.wsPort}"
        self.websocket: websockets.WebSocketClientProtocol | None = None
        self._heartbeat_task: asyncio.Task[None] | None = None
        self._running = False

        # Create TikTokLive client
        # TikTokLive reads SIGN_API_KEY directly from environment via WebSigner
        self.client = TikTokLiveClient(
            unique_id=config.tikTokUsername,
        )

        # Register event handlers with event classes (not string names)
        self.client.add_listener(CommentEvent, self._on_comment)
        self.client.add_listener(GiftEvent, self._on_gift)
        self.client.add_listener(LikeEvent, self._on_like)
        self.client.add_listener(FollowEvent, self._on_follow)
        self.client.add_listener(ShareEvent, self._on_share)
        self.client.add_listener(JoinEvent, self._on_join)
        self.client.add_listener(ConnectEvent, self._on_connect)
        self.client.add_listener(DisconnectEvent, self._on_disconnect)

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    async def _on_comment(self, event: CommentEvent) -> None:
        await self._send(_chat_payload(event, self.config.tikTokUsername))

    async def _on_gift(self, event: GiftEvent) -> None:
        await self._send(_gift_payload(event))

    async def _on_like(self, event: LikeEvent) -> None:
        await self._send(_like_payload(event))

    async def _on_follow(self, event: FollowEvent) -> None:
        await self._send(_follow_payload(event))

    async def _on_share(self, event: ShareEvent) -> None:
        await self._send(_share_payload(event))

    async def _on_join(self, event: JoinEvent) -> None:
        await self._send(_join_payload(event))

    async def _on_connect(self, _event: ConnectEvent) -> None:
        logger.info("Connected to TikTok Live")
        await self._send({"type": "connect"})

    async def _on_disconnect(self, _event: DisconnectEvent) -> None:
        logger.warning("Disconnected from TikTok Live")
        await self._send({"type": "disconnect"})

    # ------------------------------------------------------------------
    # WebSocket send
    # ------------------------------------------------------------------

    async def _send(self, payload: dict[str, Any]) -> None:
        """Send a JSON payload over the WebSocket, if connected."""
        if self.websocket is None:
            return
        try:
            await self.websocket.send(json.dumps(payload))
        except websockets.ConnectionClosed:
            # The connection loop notices the close and reconnects
            logger.warning("WebSocket connection lost (send failed)")
        except Exception:
            logger.exception("Error sending message over WebSocket")

    # ------------------------------------------------------------------
    # Connection keeper (reconnect + heartbeat)
    # ------------------------------------------------------------------

    async def _connection_loop(self) -> None:
        """Keep the Node.js WebSocket connected, sending a heartbeat every 10 seconds.

        Reconnects with backoff whenever the connection drops (e.g. the Node.js
        app restarts). Events received while disconnected are dropped.
        """
        delay = RECONNECT_MIN_DELAY
        while self._running:
            if self.websocket is None:
                try:
                    self.websocket = await asyncio.wait_for(
                        websockets.connect(self.ws_url), timeout=10
                    )
                    logger.info("Connected to WebSocket server")
                    delay = RECONNECT_MIN_DELAY
                except Exception as exc:
                    # Log once per outage, not on every retry
                    if delay == RECONNECT_MIN_DELAY:
                        logger.warning(
                            "WebSocket server at %s unavailable (%s). "
                            "Retrying until the Node.js app is up...",
                            self.ws_url,
                            exc.__class__.__name__,
                        )
                    await asyncio.sleep(delay)
                    delay = min(delay * 2, RECONNECT_MAX_DELAY)
                    continue

            ws = self.websocket
            try:
                await ws.send(json.dumps({"type": "heartbeat"}))
                # Returns early if the connection closes, so drops are noticed at once
                await asyncio.wait_for(ws.wait_closed(), timeout=10)
            except asyncio.TimeoutError:
                continue  # Still open — time for the next heartbeat
            except websockets.ConnectionClosed:
                pass
            except Exception:
                logger.exception("Error sending heartbeat")

            if self.websocket is ws:
                self.websocket = None
            logger.warning("WebSocket connection lost, reconnecting...")

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Keep the Node.js WebSocket connected and run the TikTok client."""
        self._running = True

        logger.info("Starting TikTokLive bridge")
        logger.info("Connecting to WebSocket server at %s", self.ws_url)

        self._heartbeat_task = asyncio.create_task(self._connection_loop())

        # start() returns a Task — must await it to keep the WS alive
        logger.info(
            "Connecting to TikTok Live as @%s", self.config.tikTokUsername
        )
        try:
            ws_task = await self.client.start()
            await ws_task
        except Exception:
            logger.exception("TikTokLive client encountered an error")
        finally:
            self._running = False
            if self._heartbeat_task:
                self._heartbeat_task.cancel()
            if self.websocket:
                await self.websocket.close()
                self.websocket = None
            logger.info("Bridge stopped")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    config = BridgeConfig()

    # Validate config early
    if not config.tikTokUsername:
        logger.error(
            "TIKTOK_USERNAME is not set. "
            "Create bridge/.env or set the environment variable."
        )
        sys.exit(1)

    bridge = TikTokBridge(config)

    try:
        asyncio.run(bridge.run())
    except KeyboardInterrupt:
        logger.info("Bridge stopped by user")
    except Exception:
        logger.exception("Unhandled error in bridge")
        sys.exit(1)


if __name__ == "__main__":
    main()
