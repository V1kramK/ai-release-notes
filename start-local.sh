#!/bin/bash
# Start the AI Release Notes Generator server locally.
# Usage: ./start-local.sh [--rebuild]

set -e
cd "$(dirname "$0")"

PID_FILE=/tmp/rn-server.pid
LOG_FILE=/tmp/rn-server.log

# Kill any existing instance
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping existing server (PID $OLD_PID)…"
    kill "$OLD_PID"
    sleep 1
  fi
  rm -f "$PID_FILE"
fi
pkill -f "node packages/server/dist/index.js" 2>/dev/null || true
sleep 1

# Optional rebuild
if [ "$1" = "--rebuild" ]; then
  echo "Building all packages…"
  npm run build --workspace=packages/shared
  npm run build --workspace=packages/server
  npm run build --workspace=packages/client
  echo "Build complete."
fi

echo "Starting server → http://localhost:3001"
nohup node packages/server/dist/index.js >> "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
echo "Server PID: $(cat $PID_FILE)  (logs: $LOG_FILE)"

# Wait for it to be ready
for i in {1..10}; do
  sleep 1
  if curl -sf http://localhost:3001/ > /dev/null 2>&1; then
    echo "✓ Server is ready at http://localhost:3001"
    exit 0
  fi
done

echo "✗ Server did not become ready — check $LOG_FILE"
exit 1
