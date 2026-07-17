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


# ---------------------------------------------------------------------------
# Payload builders
# ---------------------------------------------------------------------------

def _chat_payload(event: CommentEvent) -> dict[str, Any]:
    user = event.user_info
    return {
        "type": "chat",
        "userId": str(user.id),
        "uniqueId": user.username,
        "nickname": user.nick_name,
        "message": event.comment,
        "userRole": user.user_role,
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
        self.client.on(CommentEvent, self._on_comment)
        self.client.on(GiftEvent, self._on_gift)
        self.client.on(LikeEvent, self._on_like)
        self.client.on(FollowEvent, self._on_follow)
        self.client.on(ShareEvent, self._on_share)
        self.client.on(JoinEvent, self._on_join)
        self.client.on(ConnectEvent, self._on_connect)
        self.client.on(DisconnectEvent, self._on_disconnect)

    # ------------------------------------------------------------------
    # Event handlers
    # ------------------------------------------------------------------

    async def _on_comment(self, event: CommentEvent) -> None:
        await self._send(_chat_payload(event))

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
            self.websocket = None
            logger.warning("WebSocket connection lost (send failed)")
        except Exception:
            logger.exception("Error sending message over WebSocket")

    # ------------------------------------------------------------------
    # Heartbeat
    # ------------------------------------------------------------------

    async def _heartbeat_loop(self) -> None:
        """Send a heartbeat message every 10 seconds."""
        while self._running:
            try:
                if self.websocket is not None:
                    await self.websocket.send(json.dumps({"type": "heartbeat"}))
            except websockets.ConnectionClosed:
                self.websocket = None
                logger.warning("WebSocket connection lost (heartbeat)")
            except Exception:
                logger.exception("Error sending heartbeat")
            await asyncio.sleep(10)

    # ------------------------------------------------------------------
    # Run
    # ------------------------------------------------------------------

    async def run(self) -> None:
        """Connect to the Node.js WebSocket server and start TikTok client."""
        self._running = True

        # Connect to Node.js WebSocket server
        logger.info("Starting TikTokLive bridge")
        logger.info("Connecting to WebSocket server at %s", self.ws_url)

        try:
            self.websocket = await asyncio.wait_for(
                websockets.connect(self.ws_url), timeout=10
            )
            logger.info("Connected to WebSocket server")
        except asyncio.TimeoutError:
            logger.error(
                "Connection to WebSocket server timed out. Is the Node.js app running?"
            )
        except ConnectionRefusedError:
            logger.error(
                "Connection refused by WebSocket server at %s. "
                "Make sure the Node.js app is running first.",
                self.ws_url,
            )
        except Exception:
            logger.exception("Failed to connect to WebSocket server")
            self._running = False
            return

        # Start heartbeat
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

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
