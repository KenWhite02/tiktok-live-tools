# Learnings - Hybrid Bridge Refactor

## 2026-07-16
- Project is ESM (`"type": "module"`) — all imports use `.js` extensions
- Uses `tiktok-live-connector` v2.4.0 (to remove) and will add `ws` v8.x
- Container pattern for DI: `container.ts` exports lazy-initialized singletons with setters
- TikTokService extends EventEmitter and emits: chat, member, follow, share, gift, like, connected, disconnected, error
- TikTokService currently uses TikTokLiveConnection + WebcastEvent + ControlEvent from tiktok-live-connector
- Python TikTokLive library uses `@client.on("event_name")` decorator pattern
- Bridge payload format: JSON with `type` discriminator field
- Final: hybrid bridge refactor complete — all 6 waves, all 9 verification checks pass
- Key lesson: `task()` subagent spawning unavailable on free tier, all edits done directly
- TikTokService no longer needs `config` param after removing tiktok-live-connector
- Logger util exports `getLogger()` not `logger`
