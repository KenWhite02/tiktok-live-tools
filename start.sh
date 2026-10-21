#!/usr/bin/env bash
#
# One-shot launcher for the TikTok Live Music Request Bot.
#
#   ./start.sh
#
# Checks prerequisites, installs dependencies on first run, starts the
# Node.js app and the Python bridge, and stops both (and mpv) on Ctrl+C.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BRIDGE_DIR="$ROOT_DIR/bridge"
VENV_DIR="$BRIDGE_DIR/.venv"
cd "$ROOT_DIR"

info() { echo "[start] $*"; }
fail() { echo "[start] ERROR: $*" >&2; exit 1; }

# Read KEY from an env file (empty if missing)
env_value() {
  grep -E "^$2=" "$1" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '"'"'"' \r' || true
}

# ─── Prerequisites ──────────────────────────────────────────────────────────

for cmd in node pnpm mpv yt-dlp lsof; do
  command -v "$cmd" >/dev/null 2>&1 || fail "'$cmd' is not installed (see README → Prerequisites)"
done

PYTHON="$(command -v python3.12 || command -v python3 || true)"
[[ -n "$PYTHON" ]] || fail "python3 is not installed"

[[ -f "$ROOT_DIR/.env" ]] || { cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"; info "Created .env from .env.example"; }

if [[ ! -f "$BRIDGE_DIR/.env" ]]; then
  cp "$BRIDGE_DIR/.env.example" "$BRIDGE_DIR/.env"
  fail "Created bridge/.env — set TIKTOK_USERNAME in it, then run ./start.sh again"
fi

TIKTOK_USERNAME="${TIKTOK_USERNAME:-$(env_value "$BRIDGE_DIR/.env" TIKTOK_USERNAME)}"
if [[ -z "$TIKTOK_USERNAME" || "$TIKTOK_USERNAME" == "your_tiktok_username" ]]; then
  fail "Set TIKTOK_USERNAME in bridge/.env"
fi

# A WS_PORT set in the environment overrides both .env files
if [[ -z "${WS_PORT:-}" ]]; then
  WS_PORT="$(env_value "$ROOT_DIR/.env" WS_PORT)"
  WS_PORT="${WS_PORT:-9090}"
  BRIDGE_PORT="$(env_value "$BRIDGE_DIR/.env" WS_PORT)"
  if [[ -n "$BRIDGE_PORT" && "$BRIDGE_PORT" != "$WS_PORT" ]]; then
    fail "WS_PORT mismatch: .env has $WS_PORT but bridge/.env has $BRIDGE_PORT"
  fi
fi

# ─── Dependencies (first run only) ──────────────────────────────────────────

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  info "Installing Node.js dependencies..."
  pnpm install
fi

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  info "Creating Python virtualenv in bridge/.venv..."
  "$PYTHON" -m venv "$VENV_DIR"
fi
if ! "$VENV_DIR/bin/python" -c "import TikTokLive, websockets, dotenv" 2>/dev/null; then
  info "Installing Python bridge dependencies..."
  "$VENV_DIR/bin/python" -m pip install --quiet -r "$BRIDGE_DIR/requirements.txt"
fi

# ─── Refuse to double-start ─────────────────────────────────────────────────

if lsof -nP -iTCP:"$WS_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -nP -iTCP:"$WS_PORT" -sTCP:LISTEN >&2
  fail "Port $WS_PORT is already in use — is the bot already running? Stop it first."
fi

# ─── Run ────────────────────────────────────────────────────────────────────

NODE_PID=""
BRIDGE_PID=""

cleanup() {
  trap - INT TERM EXIT
  echo
  info "Shutting down..."
  [[ -n "$BRIDGE_PID" ]] && kill -INT "$BRIDGE_PID" 2>/dev/null || true
  # Node handles SIGTERM by stopping mpv; signal its whole process group
  [[ -n "$NODE_PID" ]] && kill -TERM -- "-$NODE_PID" 2>/dev/null || true
  for _ in $(seq 1 20); do
    kill -0 -- "-$NODE_PID" 2>/dev/null || kill -0 "$BRIDGE_PID" 2>/dev/null || break
    sleep 0.25
  done
  [[ -n "$NODE_PID" ]] && kill -KILL -- "-$NODE_PID" 2>/dev/null || true
  [[ -n "$BRIDGE_PID" ]] && kill -KILL "$BRIDGE_PID" 2>/dev/null || true
  info "Stopped"
}
trap 'cleanup; exit 130' INT TERM
trap cleanup EXIT

# Job control gives each child its own process group, so cleanup can stop
# Node together with everything it spawned (tsx, mpv)
set -m

info "Starting Node.js app..."
"$ROOT_DIR/node_modules/.bin/tsx" src/index.ts &
NODE_PID=$!

info "Waiting for WebSocket server on port $WS_PORT..."
for _ in $(seq 1 30); do
  lsof -nP -iTCP:"$WS_PORT" -sTCP:LISTEN >/dev/null 2>&1 && break
  kill -0 "$NODE_PID" 2>/dev/null || fail "Node.js app exited during startup (see output above)"
  sleep 0.5
done
# The bridge retries on its own, so a slow Node startup is not fatal
lsof -nP -iTCP:"$WS_PORT" -sTCP:LISTEN >/dev/null 2>&1 \
  || info "WebSocket server not up yet — the bridge will keep retrying"

info "Starting Python bridge for @$TIKTOK_USERNAME..."
(cd "$BRIDGE_DIR" && exec "$VENV_DIR/bin/python" -u server.py) &
BRIDGE_PID=$!

info "Bot running — press Ctrl+C to stop"

# Exit (and clean up) as soon as either process stops
while kill -0 "$NODE_PID" 2>/dev/null && kill -0 "$BRIDGE_PID" 2>/dev/null; do
  sleep 1
done
kill -0 "$NODE_PID" 2>/dev/null || info "Node.js app exited"
kill -0 "$BRIDGE_PID" 2>/dev/null || info "Python bridge exited"
