#!/usr/bin/env bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start Node.js app in background
echo "[start] Starting Node.js app..."
pnpm --prefix "$ROOT_DIR" dev &
NODE_PID=$!

# Wait for Node.js WebSocket server to be ready
echo "[start] Waiting for WebSocket server..."
for i in $(seq 1 15); do
  if lsof -ti:9090 2>/dev/null | grep -q .; then
    echo "[start] WebSocket server ready"
    break
  fi
  sleep 1
done

# Start Python bridge
echo "[start] Starting Python bridge..."
source "$ROOT_DIR/bridge/.venv/bin/activate" 2>/dev/null || source "$HOME/venv/bin/activate"
python3 "$ROOT_DIR/bridge/server.py"

# Cleanup on exit
kill $NODE_PID 2>/dev/null
echo "[start] Stopped"
