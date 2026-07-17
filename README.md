# 🎵 TikTok Live Music Request Bot

A production-ready Node.js bot that reads TikTok Live chat, processes `!play` commands, searches YouTube via `yt-dlp`, and streams audio through `mpv`.

## Features

- **Music Requests** — Viewers type `!play <song>` to request songs
- **Smart Queue** — FIFO queue with auto-advance, unlimited length
- **YouTube Search** — Uses `yt-dlp` to find the best audio match
- **Audio Streaming** — Direct audio streaming via `mpv` (no full video download)
- **Song Validation** — Rejects live streams, private videos, age-restricted content, songs >10 min
- **Anti-Spam** — Per-user cooldown (configurable, moderators exempt)
- **Persistent Storage** — SQLite database for song history, user stats, favorites
- **Hybrid Architecture** — Python TikTokLive bridge forwards events to Node.js via local WebSocket
- **Crash Recovery** — Auto-restart mpv if it crashes
- **Modular Events** — Extensible event system for TikTok events (chat, join, follow, share, gift, like)
- **Professional Logging** — Structured logging via Pino with pretty-print in development
- **Graceful Shutdown** — Clean shutdown on SIGINT/SIGTERM

## Commands

| Command | Description | Moderator Only |
|---------|-------------|:---:|
| `!play <song>` | Request a song by name or YouTube URL | ❌ |
| `!queue` | Show the current music queue | ❌ |
| `!np` | Show the currently playing song | ❌ |
| `!help` | Show all available commands | ❌ |
| `!skip` | Skip the current song | ✅ |
| `!pause` | Pause playback | ✅ |
| `!resume` | Resume playback | ✅ |
| `!stop` | Stop playback and clear the queue | ✅ |
| `!volume <0-100>` | Set player volume | ✅ |
| `!clear` | Clear the entire queue | ✅ |

## Prerequisites

- **Node.js** 22+
- **pnpm** 9+
- **Python** 3.12+
- **mpv** — Media player ([mpv.io](https://mpv.io))
- **yt-dlp** — YouTube downloader ([yt-dlp.org](https://yt-dlp.org))
- **ffmpeg** — Recommended for yt-dlp post-processing

### Installing mpv

**macOS:**
```bash
brew install mpv
```

**Ubuntu/Debian:**
```bash
sudo apt install mpv
```

**Arch Linux:**
```bash
sudo pacman -S mpv
```

**Windows:**
Download from [mpv.io](https://mpv.io/install/) or use winget:
```powershell
winget install mpv
```

### Installing yt-dlp

**macOS:**
```bash
brew install yt-dlp
```

**Ubuntu/Debian:**
```bash
sudo apt install yt-dlp
```

**Arch Linux:**
```bash
sudo pacman -S yt-dlp
```

**Windows:**
```powershell
winget install yt-dlp
```

Or use the Python package:
```bash
pip install yt-dlp
```

### Setting Up the Python Bridge

The Python bridge requires Python 3.12+ and the `TikTokLive` library.

```bash
# Install Python bridge dependencies
cd bridge
pip install -r requirements.txt
cd ..
```

### Running the Bridge

The bridge and Node.js app run as two separate processes. Start Node.js first,
then the Python bridge.

**Terminal 1 (Node.js):**
```bash
pnpm dev
```

**Terminal 2 (Python bridge):**
```bash
cd bridge
# Set your TikTok username via environment or bridge/.env
TIKTOK_USERNAME=your_username python3 server.py
```

The bridge will connect to the Node.js WebSocket server and begin forwarding
TikTok Live events. You should see:

```
Node.js:  BridgeService: WebSocket server listening on ws://127.0.0.1:9090
Node.js:  BridgeService: bridge client connected
Python:   Connected to WebSocket server
Python:   Connected to TikTok Live as @your_username
```

### Troubleshooting

| Problem | Solution |
|---------|----------|
| `Connection refused` in Python | Make sure Node.js is running first |
| `TIKTOK_USERNAME is required` | Set the env var or create `bridge/.env` |
| No events received | Check both processes are running and TikTok stream is live |
| Python bridge crashes | Run with `LOG_LEVEL=debug` for verbose logging |
| Port 9090 in use | Change `WS_PORT` in both `.env` and `bridge/.env` |

### Installing ffmpeg (Recommended)

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt install ffmpeg
```

## Quick Start

```bash
# 1. Clone the repository
git clone <your-repo-url>
cd tiktok-live-tools

# 2. Install Node.js dependencies
pnpm install

# 3. Install Python bridge dependencies
cd bridge
pip install -r requirements.txt
cd ..

# 4. Configure environments
cp .env.example .env
cp bridge/.env.example bridge/.env
# Edit bridge/.env with your TikTok username

# 5. Start the bot (Node.js)
pnpm dev

# 6. In a separate terminal, start the Python bridge
cd bridge
python3 server.py
```

## Configuration

### Node.js (.env)

Edit `.env` with your settings:

```env
# WebSocket Bridge (Python TikTokLive)
WS_HOST=127.0.0.1
WS_PORT=9090

# Media Player Paths
MPV_PATH=mpv
YTDLP_PATH=yt-dlp

# Bot Settings
COOLDOWN=120              # Anti-spam cooldown in seconds (default: 120)
MAX_DURATION=600          # Max song duration in seconds (default: 600 = 10 min)
DEFAULT_VOLUME=70         # Default volume (0-100)

# Database
DATABASE_PATH=./data/bot.db

# MPV Socket
MPV_SOCKET_PATH=/tmp/tiktok-mpv.sock

# Logging
LOG_LEVEL=info            # debug | info | warn | error
```

### Python Bridge (bridge/.env)

Edit `bridge/.env` with your TikTok username:

```env
# TikTok Live Configuration
TIKTOK_USERNAME=your_tiktok_username

# WebSocket Bridge Configuration
WS_HOST=127.0.0.1
WS_PORT=9090

# Logging
LOG_LEVEL=info
```

## Architecture

```
                    TikTok Live
                         │
                         ▼
                Python Bridge (TikTokLive)
                         │
                  WebSocket (localhost:9090)
                         │
                         ▼
              Node.js Main Application

  App → BridgeService → TikTokService (adapter)
                      → EventBus → Command Dispatcher
                                 → QueueService → PlayerService (mpv)
                                 → SearchService (yt-dlp)
                                 → DatabaseService (SQLite)
                                 → CooldownService
```

The Python `TikTokLive` library handles the TikTok Live WebSocket connection and
forwards events as JSON over a local WebSocket to the Node.js application. The
Node.js `BridgeService` receives these events, validates them, and emits typed
events. `TikTokService` subscribes to `BridgeService` events and re-emits them
with the same payload shapes as the original `tiktok-live-connector`, ensuring
all existing command handlers and event subscribers work unchanged.

## Project Structure

```
bridge/                         # Python TikTokLive bridge
├── server.py                   # Main bridge entry point
├── config.py                   # Bridge configuration loader
├── requirements.txt            # Python dependencies
└── .env.example                # Bridge environment template

src/
├── index.ts                 # Entry point
├── app.ts                   # App bootstrap & service wiring
├── container.ts             # Service container (dependency injection)
├── config/
│   └── index.ts             # Environment configuration loader
├── types/
│   └── index.ts             # Shared TypeScript interfaces
├── models/
│   ├── Song.ts              # Song factory
│   └── QueueItem.ts         # Queue item factory
├── services/
│   ├── TikTokService.ts     # TikTok Live connection & reconnection
│   ├── PlayerService.ts     # mpv IPC control (play, pause, stop, volume)
│   ├── QueueService.ts      # FIFO song queue management
│   ├── SearchService.ts     # yt-dlp search & audio URL resolution
│   ├── DatabaseService.ts   # SQLite persistence (songs, requests, users)
│   └── CooldownService.ts   # Anti-spam cooldown tracking
├── commands/
│   ├── index.ts             # Command registry & dispatcher
│   ├── play.ts              # !play handler
│   ├── queue.ts             # !queue handler
│   ├── np.ts                # !np handler
│   ├── skip.ts              # !skip handler
│   ├── pause.ts             # !pause handler
│   ├── resume.ts            # !resume handler
│   ├── stop.ts              # !stop handler
│   ├── volume.ts            # !volume handler
│   ├── clear.ts             # !clear handler
│   └── help.ts              # !help handler
├── events/
│   ├── TikTokEventBus.ts    # Central typed event bus
│   └── handlers.ts          # Event handler registration
└── utils/
    └── logger.ts            # Pino logger setup
```

### Architecture Principles

- **Single Responsibility** — Each service handles exactly one concern
- **Dependency Injection** — Services are wired through a container module
- **Event-Driven** — Communication via EventEmitter for loose coupling
- **Clean Architecture** — Separation of concerns with clear boundaries
- **Hybrid Runtime** — Python handles TikTok protocol only; Node.js handles all application logic

### Data Flow

```
TikTok Live Chat
      ↓
Python Bridge (TikTokLive)
      ↓ (WebSocket JSON)
BridgeService (validates events)
      ↓ (emits typed events)
TikTokService (adapter)
      ↓ (emits 'chat' event — same shape as before)
app.ts (command dispatcher)
      ↓ (cooldown check → parse command)
Command Handler (e.g., !play handler)
      ↓ (search & validate)
SearchService (yt-dlp)
      ↓ (song found ✓)
QueueService (enqueue)
      ↓ (auto-play if idle)
SearchService.getAudioUrl()
      ↓ (audio stream URL)
PlayerService.loadSong() (mpv IPC)
      ↓ (song ends → auto-next)
QueueService.completeCurrent() → next song
```

## Future Extensions

The modular architecture makes it easy to add:

- **Web Dashboard** — Express/Fastify UI for queue management
- **Discord Bot** — Mirror commands/status to Discord
- **OBS Overlay** — Display now-playing info on stream
- **Spotify Integration** — Cross-platform search
- **WebSocket API** — Real-time status for external apps
- **REST API** — Queue management via HTTP
- **Song Voting** — Let viewers vote on next song
- **Request Points** — Earn points to skip the queue
- **Premium Queue** — Priority queue for supporters
- **Admin Panel** — Full web-based administration

## Development

```bash
# Development mode (with hot reload)
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start

# Lint
pnpm lint

# Format code
pnpm format
```

## Logging

Logs are structured JSON via Pino. In development, they're pretty-printed with colors.

```
[2026-07-16 10:30:45] INFO:  Starting TikTok Live Music Request Bot...
[2026-07-16 10:30:46] INFO:  mpv process spawned {"pid": 12345}
[2026-07-16 10:30:46] INFO:  Connected to mpv IPC socket
[2026-07-16 10:30:47] INFO:  Connected to TikTok Live successfully
[2026-07-16 10:31:02] INFO:  Chat message received {"user": "viewer123", "comment": "!play Alan Walker Faded"}
[2026-07-16 10:31:03] INFO:  Searching for song {"query": "Alan Walker Faded"}
[2026-07-16 10:31:05] INFO:  Song queued {"title": "Alan Walker - Faded", "position": 0}
[2026-07-16 10:31:05] INFO:  Now playing {"title": "Alan Walker - Faded", "duration": 211}
```

## Project Status

This is a **production-ready** bot that can run for hours without issues. It includes:

- ✅ Complete command system
- ✅ Music request flow
- ✅ Queue management
- ✅ Anti-spam protection
- ✅ Song validation
- ✅ Persistent storage
- ✅ Auto-reconnect
- ✅ Crash recovery
- ✅ Graceful shutdown
- ✅ Comprehensive logging

## License

MIT
