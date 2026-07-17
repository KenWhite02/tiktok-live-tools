# Hybrid Bridge Refactor — Draft

## Intent
- **intent**: clear
- **review_required**: false (not requested)
- **size**: Architecture (5+ modules, cross-language bridge)

## Status
**plan-written**
Plan file: `.omo/plans/hybrid-bridge-refactor.md`
Approach: Refactor from tiktok-live-connector → Python TikTokLive + WebSocket bridge
14 todos across 6 waves. Final verification wave with 9 checks.

## Key Decisions (adopted defaults)

### WebSocket Library
Node.js `ws` package (native, no frameworks, battle-tested, zero dependencies beyond the package). Added to `package.json`, `tiktok-live-connector` removed.

### Python Bridge Structure
- `bridge/server.py` — main entry point (TikTokLive client + WebSocket client)
- `bridge/config.py` — dataclass config + env loader
- `bridge/requirements.txt` — `TikTokLive`, `websockets`, `python-dotenv`
- `bridge/.env` — TIKTOK_USERNAME, WS_HOST, WS_PORT, LOG_LEVEL

### Architecture Flow
```
Python TikTokLive client → WebSocket Client → Node.js WebSocket Server (BridgeService)
→ TikTokService (adapter, emits same events as before) → EventBus → Command Dispatcher → Services
```

### TikTokService Public API Compatibility
The adapter pattern ensures TikTokService still emits:
- `chat` → `{ userId, uniqueId, nickname, comment, isModerator, timestamp }`
- `member` → `{ userId, uniqueId }`
- `follow` → `{ userId, uniqueId }`
- `share` → `{ userId, uniqueId }`
- `gift` → `{ userId, uniqueId, giftName, giftId, repeatCount, diamondCost }`
- `like` → `{ userId, uniqueId, count }`
- `connected` → no payload
- `disconnected` → no payload
- `error` → `{ message }`

### Python Bridge JSON Payloads
Per spec: `type` field discriminator. Types: `chat`, `gift`, `like`, `follow`, `share`, `join`, `disconnect`, `connect`, `heartbeat`.

### Heartbeat
Python sends `{ "type": "heartbeat" }` every 10s.
Node.js detects timeout after 30s → logs warning → triggers reconnect.

### Config Changes
- **Removed from .env**: `SIGN_API_KEY`, `TIKTOK_USERNAME` (moves to bridge)
- **Added to .env**: `WS_HOST=127.0.0.1`, `WS_PORT=9090`
- **Bridge .env**: `TIKTOK_USERNAME=`, `WS_HOST=127.0.0.1`, `WS_PORT=9090`

### Reconnect Strategy
BridgeService: on timeout/disconnect, log and wait (TikTokService stays in `disconnected` state). Python bridge: auto-reconnect via TikTokLive built-in. User restarts Python script manually or with a supervisor (systemd/supervisor).

### Test Strategy
Agent-executed QA per todo. No existing test suite — QA will verify: TypeScript compilation (tsc --noEmit), manual smoke test via log inspection, Python syntax check, WebSocket handshake verification.

## Components Ledger
| Id | Component | Outcome | Status |
|----|-----------|---------|--------|
| C1 | BridgeService.ts (Node.js WebSocket server) | Must handle connect/disconnect/validate/emit/ heartbeat timeout | Explored |
| C2 | TikTokService.ts rewrite (adapter pattern) | Subscribe to BridgeService, emit same events | Explored |
| C3 | Python bridge (server.py + config.py) | TikTokLive client → WebSocket → Node.js | Explored |
| C4 | Dependency changes (package.json deps) | Remove tiktok-live-connector, add ws | Explored |
| C5 | Config changes (.env, types, config loader) | WS_HOST, WS_PORT; remove SIGN_API_KEY | Explored |
| C6 | Container + app wiring | Instantiate BridgeService, pass to TikTokService | Explored |
| C7 | README update | New architecture diagram, Python setup instructions | Explored |

## Evidence / Files Read
- `src/services/TikTokService.ts` — full adapter replacement needed
- `src/types/index.ts` — AppConfig has `signApiKey` to remove, `tiktokUsername` to remove
- `src/config/index.ts` — imports signApiKey from .env
- `src/container.ts` — Container class with service setters
- `src/services/index.ts` — barrel exports
- `src/app.ts` — bootstrap wiring
- `src/events/TikTokEventBus.ts` — stays unchanged
- `src/events/handlers.ts` — stays unchanged
- `package.json` — tiktok-live-connector dependency to remove
- `.env.example` — fields to update
- TikTokLive Python library docs (fetched from GitHub raw)
