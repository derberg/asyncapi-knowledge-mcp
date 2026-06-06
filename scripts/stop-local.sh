#!/usr/bin/env bash
# Stop a local stack started by scripts/run-local.sh:
#   dev server (chat UI + /api/chat)             :7180
#   local OpenCrane MCP (offline mode)           :7181
#   (override the ports via CHAT_PORT / MCP_PORT to match run-local).
#
# Finds processes by port AND by signature (so it still works if run-local
# auto-bumped a busy port), then escalates SIGTERM -> SIGKILL. Only targets
# this project's processes. Useful when run-local was detached and Ctrl-C
# isn't an option.
#
# Usage: ./scripts/stop-local.sh
set -uo pipefail

PORTS=("${CHAT_PORT:-7180}" "${MCP_PORT:-7181}")

collect() { # unique PIDs from the ports + this repo's dev server + opencrane serve
  {
    for p in "${PORTS[@]}"; do lsof -ti "tcp:$p" 2>/dev/null || true; done
    pgrep -f "scripts/dev-server.mjs" 2>/dev/null || true
    pgrep -f "opencrane serve" 2>/dev/null || true
  } | sort -u
}

pids="$(collect)"
if [ -z "$pids" ]; then
  echo "Nothing running on the local-stack port/signature."
  exit 0
fi

echo "==> Stopping (SIGTERM): $(echo "$pids" | tr '\n' ' ')"
echo "$pids" | xargs kill 2>/dev/null || true
sleep 1

pids="$(collect)"
if [ -n "$pids" ]; then
  echo "==> Still alive, forcing (SIGKILL): $(echo "$pids" | tr '\n' ' ')"
  echo "$pids" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

left="$(collect)"
if [ -z "$left" ]; then
  echo "Stopped — local dev port(s) are free."
else
  echo "WARNING: still running: $(echo "$left" | tr '\n' ' ')" >&2
  exit 1
fi
