# hybrid-bridge-refactor - Work Plan

## TL;DR (For humans)

**What you'll get:** The bot keeps working exactly as before, but instead of using the Node.js `tiktok-live-connector` library to receive TikTok events, it uses a Python bridge process (`TikTokLive` library) that sends events over a local WebSocket to the Node.js app.

**Why this approach:** The Python `TikTokLive` library is more actively maintained, has better TikTok protocol compatibility, and doesn't require a fragile sign API key. Python handles ONLY event reception; Node.js stays the full application.

**What it will NOT do:** It will NOT change any existing service (QueueService, PlayerService, SearchService, DatabaseService, CooldownService), any command handler, any event bus behavior, any mpv/yt-dlp logic, or any SQLite schema. It will NOT add new features.

**Effort:** ~250 lines new code + ~150 lines modified across ~15 files. 6 execution waves.

**Key risk:** Python runtime must be available on the host. The user needs to `pip install -r bridge/requirements.txt` separately. The Python process must be started alongside (or before) the Node.js app.

**Decisions:**
- WebSocket library: `ws` (Node.js), `websockets` (Python) — zero-framework, minimal deps
- Bridge port: `9090` on localhost only
- Heartbeat: Python sends every 10s, Node times out after 30s
- Reconnection: Python auto-reconnects via TikTokLive built-in; Node BridgeService logs and waits
- All existing service public APIs are PRESERVED — no other file needs changes beyond what's listed

## Scope

### IN Scope
1. Remove `tiktok-live-connector` from `package.json`; add `ws` dependency; reinstall
2. Update `AppConfig` type — remove `signApiKey`, add `wsHost`/`wsPort`
3. Update `config/index.ts` — remove `SIGN_API_KEY`, load `WS_HOST`/`WS_PORT` from env
4. Create `bridge/server.py` — Python TikTokLive client that connects to TikTok and forwards events via WebSocket client
5. Create `bridge/config.py` — dataclass config + dotenv loader for Python bridge
6. Create `bridge/requirements.txt` — `TikTokLive`, `websockets`, `python-dotenv`
7. Create `bridge/.env.example` — Python env template
8. Create `src/services/BridgeService.ts` — Node.js WebSocket server with heartbeat detection, payload validation, event emission
9. Rewrite `src/services/TikTokService.ts` — remove ALL tiktok-live-connector code; subscribe to BridgeService events; preserve exact same EventEmitter public API
10. Update `src/services/index.ts` — export BridgeService
11. Update `src/container.ts` — add `BridgeService` setter/export
12. Update `src/app.ts` — instantiate BridgeService, wire TikTokService to BridgeService, start bridge listener
13. Update `.env.example` — remove `SIGN_API_KEY`, `TIKTOK_USERNAME`; add `WS_HOST`, `WS_PORT`
14. Update `README.md` — add architecture diagram, Python setup instructions, bridge run instructions

### OUT Scope / Must-NOT-Have
- No changes to QueueService, PlayerService, SearchService, DatabaseService, CooldownService
- No changes to any command handler (`src/commands/*.ts`)
- No changes to TikTokEventBus or event handler registration
- No changes to logger, types (beyond AppConfig), or existing service interfaces
- No Docker, no process supervisor — user manages Python process manually
- No automatic startup of Python bridge from Node.js — two separate processes
- No breaking changes to TikTokService public API (`connect`, `disconnect`, `connected`, event names, event payload shapes)

## Verification strategy

### Per-todo verification
Each todo has its own acceptance criteria + QA steps. Every file change is verified by:
1. **TypeScript**: `npx tsc --noEmit` must pass with zero errors after each compilation-relevant wave
2. **Python syntax**: `python3 -m py_compile bridge/server.py bridge/config.py` must pass
3. **Runtime structure**: No undefined imports, no missing exports, no dead code paths

### Integration verification
After ALL todos complete, a final verification wave runs:
- F1: TypeScript compilation — `npx tsc --noEmit` — zero errors
- F2: Python syntax — `python3 -m py_compile bridge/server.py` and `bridge/config.py` — zero errors
- F3: Dependency audit — `tiktok-live-connector` not in package.json nor node_modules lockfile
- F4: Export audit — BridgeService is importable from `./services/index.js`
- F5: Container audit — BridgeService setter exists and is callable
- F6: TikTokService audit — no import of `tiktok-live-connector` anywhere in source
- F7: Manual smoke test — start Node.js, start Python bridge, verify WebSocket handshake logs appear

## Execution strategy

**Ordering principle:** Dependencies-first — types → config → Python bridge → BridgeService → TikTokService → wiring → docs.

**Waves:**
1. **Dependencies + Types** (package.json, types, config) — foundational changes everything else depends on
2. **Python Bridge** (server.py, config.py, requirements.txt, .env.example) — independent, can run in parallel with wave 3
3. **BridgeService.ts** (Node.js WebSocket server) — new service
4. **TikTokService rewrite** — adapter pattern, removes all old code
5. **Wiring** (container, services/index, app.ts) — glue everything together
6. **Documentation** (.env.example, README) — final polish

**Parallelism:** Waves 2 (Python) and 3 (BridgeService) are independent and can be executed in either order or simultaneously.

## Todos

### Wave 1: Dependencies + Types + Config [COMPLETE]

#### ~~Todo 1.1: Update package.json — remove tiktok-live-connector, add ws~~ ✅
- `tiktok-live-connector` removed, `ws` added, `@types/ws` installed

#### ~~Todo 1.2: Update AppConfig type — remove signApiKey, add wsHost/wsPort~~ ✅
- `signApiKey` and `tikTokUsername` removed, `wsHost`/`wsPort` added

#### ~~Todo 1.3: Update config/index.ts — remove SIGN_API_KEY, add WS_HOST/WS_PORT~~ ✅
- Config loads `WS_HOST`/`WS_PORT`, unused `requiredEnv` removed

### Wave 2: Python Bridge [COMPLETE]

#### ~~Todo 2.1: Create bridge/requirements.txt~~ ✅
#### ~~Todo 2.2: Create bridge/config.py~~ ✅
#### ~~Todo 2.3: Create bridge/server.py~~ ✅
#### ~~Todo 2.4: Create bridge/.env.example~~ ✅

### Wave 3: BridgeService (Node.js WebSocket Server) [COMPLETE]

#### ~~Todo 3.1: Create src/services/BridgeService.ts~~ ✅

### Wave 4: TikTokService Rewrite [COMPLETE]

#### ~~Todo 4.1: Rewrite src/services/TikTokService.ts as adapter~~ ✅

### Wave 5: Wiring [COMPLETE]

#### ~~Todo 5.1: Export BridgeService from services/index.ts~~ ✅
#### ~~Todo 5.2: Add BridgeService to container.ts~~ ✅
#### ~~Todo 5.3: Update app.ts — wire BridgeService → TikTokService → command pipeline~~ ✅

### Wave 6: Documentation [COMPLETE]

#### ~~Todo 6.1: Update .env.example~~ ✅
#### ~~Todo 6.2: Update README.md~~ ✅

## Final verification wave

Run ALL in parallel after todos complete:

| Check | Command/Action | Must Pass |
|-------|----------------|-----------|
| F1 TypeScript compilation | `npx tsc --noEmit` | Exit code 0 |
| F2 Python syntax | `python3 -m py_compile bridge/server.py && python3 -m py_compile bridge/config.py` | Exit code 0 |
| F3 No tiktok-live-connector in source | `grep -r "tiktok-live-connector" src/` | Empty output |
| F4 No tiktok-live-connector in deps | `grep "tiktok-live-connector" package.json` | Empty output |
| F5 BridgeService exportable | `grep "BridgeService" src/services/index.ts` | Match found |
| F6 Container has BridgeService | `grep "setBridgeService" src/container.ts` | Match found |
| F7 TikTokService adapts BridgeService | `grep "import.*BridgeService" src/services/TikTokService.ts` | Match found |
| F8 ws dependency present | `grep "ws" package.json` | Match found |
| F9 .env.example updated | `grep "WS_HOST" .env.example && grep "SIGN_API_KEY" .env.example` | First passes, second empty |

Manual integration test after all pass:
1. `pnpm dev` — Node.js starts, logs "WebSocket server listening on ws://127.0.0.1:9090"
2. In another terminal: `cd bridge && TIKTOK_USERNAME=test python3 server.py` — Python connects, logs "Connected to WebSocket server"
3. Node.js logs "Bridge client connected"
4. Ctrl+C both — graceful shutdown

## Commit strategy

| # | Commit message | Wave |
|---|----------------|------|
| 1 | `chore(deps): replace tiktok-live-connector with ws` | 1 |
| 2 | `refactor(types): replace TikTok config fields with bridge WebSocket config` | 1 |
| 3 | `refactor(config): replace TikTok env vars with bridge WebSocket config` | 1 |
| 4 | `feat(bridge): add Python dependencies for TikTokLive bridge` | 2 |
| 5 | `feat(bridge): add Python config loader for TikTokLive bridge` | 2 |
| 6 | `feat(bridge): add Python TikTokLive bridge with WebSocket event forwarding` | 2 |
| 7 | `docs(bridge): add Python bridge .env.example` | 2 |
| 8 | `feat(core): add BridgeService WebSocket server for Python bridge communication` | 3 |
| 9 | `refactor(core): rewrite TikTokService as adapter subscribing to BridgeService` | 4 |
| 10 | `chore(services): export BridgeService from barrel` | 5 |
| 11 | `chore(container): add BridgeService to dependency injection container` | 5 |
| 12 | `refactor(core): wire BridgeService into app bootstrap and TikTokService` | 5 |
| 13 | `docs(env): update .env.example for hybrid bridge architecture` | 6 |
| 14 | `docs(readme): update architecture documentation for hybrid bridge design` | 6 |

Target: 14 atomic commits. Each commit leaves the project in a valid state (TypeScript may fail between Wave 2 and Wave 5 — acceptable during active development but all pass at final verification).

**Status: ALL WAVES COMPLETE — Final Verification PASSED on 2026-07-16**

## Success criteria

1. ✅ Zero `tiktok-live-connector` references in any source file
2. ✅ `ws` package replaces it in `package.json` and `node_modules`
3. ✅ Python bridge (server.py) connects to TikTok Live and forwards events as JSON via WebSocket
4. ✅ Node.js BridgeService receives events, validates them, emits typed events
5. ✅ TikTokService adapter re-emits events with identical payload shapes to the old TikTokService
6. ✅ All existing services, commands, event bus, and pipeline work unchanged
7. ✅ TypeScript compiles with zero errors
8. ✅ Python bridge syntax-compiles with zero errors
9. ✅ README documents the hybrid architecture with Python setup instructions
10. ✅ Manual integration: Node.js + Python bridge connect and events flow end-to-end
