#!/usr/bin/env bash
# Run the full AsyncAPI Knowledge chat stack locally with one command.
#
# A single local dev server (scripts/dev-server.mjs — no Vercel account needed)
# serves everything, exactly like Vercel does in production:
#   - static chat UI               http://localhost:<CHAT_PORT>/
#   - chat function (agent loop)   http://localhost:<CHAT_PORT>/api/chat
#   - MCP server                   http://localhost:<CHAT_PORT>/api/mcp
#
# DEFAULT MODE (offline):
#   - Inference via local Ollama (OpenAI-compatible) — zero keys needed.
#   - Search via a locally running OpenCrane MCP server (Milvus Lite, uses
#     .opencrane/chunks.json to build a local index on first run).
#   - Requires: uv (for uvx), Ollama, Node 20+.
#
# HOSTED MODE (--hosted):
#   - Production parity: in-process search + AI Gateway inference.
#   - Requires: AI_GATEWAY_API_KEY (env or .env.local), Node 20+.
#
# Ports default to 7180 (dev server) and 7181 (local OpenCrane MCP) — chosen
# to avoid the usual suspects (3000/8000/8080) — and are picked dynamically
# if busy (override via CHAT_PORT / MCP_PORT).
#
# Usage: ./scripts/run-local.sh                                 # offline via Ollama
#        OLLAMA_MODEL=llama3.2 ./scripts/run-local.sh           # different local model
#        ./scripts/run-local.sh --hosted                        # AI Gateway path
#                                                               # (needs AI_GATEWAY_API_KEY)
#
# Stop a detached stack with ./scripts/stop-local.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

OLLAMA_URL="${OLLAMA_URL:-http://localhost:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-mistral-small3.2}"
MODE="${1:-offline}"
LOG_DIR="${TMPDIR:-/tmp}/asyncapi-knowledge-local-logs"
mkdir -p "$LOG_DIR"

need() {
  command -v "$1" >/dev/null 2>&1 && return 0
  echo "ERROR: '$1' not found. Install it:" >&2
  case "$1" in
    uvx)     echo "  uv:     brew install uv      |  curl -LsSf https://astral.sh/uv/install.sh | sh" >&2 ;;
    ollama)  echo "  Ollama: brew install ollama  |  https://ollama.com/download" >&2 ;;
    npm)     echo "  Node:   brew install node    |  https://nodejs.org" >&2 ;;
    python3) echo "  Python: brew install python  |  https://www.python.org/downloads/" >&2 ;;
    curl)    echo "  curl:   brew install curl    |  (usually preinstalled)" >&2 ;;
    *)       echo "  (see the tool's documentation for install instructions)" >&2 ;;
  esac
  exit 1
}
need npm; need python3; need curl

port_free() {
  python3 - "$1" <<'PY'
import socket, sys
s = socket.socket()
s.settimeout(0.3)
busy = s.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0
s.close()
sys.exit(1 if busy else 0)
PY
}
pick_port() { # $1 = preferred port — echoes the first free port from there up
  local p="$1"
  until port_free "$p"; do p=$((p + 1)); done
  if [ "$p" != "$1" ]; then echo "    (port $1 busy -> using $p)" >&2; fi
  echo "$p"
}
CHAT_PORT="$(pick_port "${CHAT_PORT:-7180}")"
MCP_PORT="$(pick_port "${MCP_PORT:-7181}")"

# ---------------------------------------------------------------------------
# Mode-specific setup
# ---------------------------------------------------------------------------

# .env.local: vercel dev used to read this automatically; the dev server does
# not, so source it here (existing environment variables take precedence).
if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

if [ "$MODE" = "--hosted" ]; then
  # --- hosted: needs AI_GATEWAY_API_KEY, no Ollama/opencrane ----------------
  if [ -z "${AI_GATEWAY_API_KEY:-}" ]; then
    echo "ERROR: --hosted needs AI_GATEWAY_API_KEY (env or .env.local)." >&2
    echo "  Set it in your environment or add it to .env.local:" >&2
    echo "    AI_GATEWAY_API_KEY=your-key" >&2
    echo "  See .env.example for the full list of supported variables." >&2
    exit 1
  fi
  export AI_GATEWAY_API_KEY
else
  # --- offline: needs uvx + ollama, no gateway key required -----------------
  need uvx; need ollama

  # Verify Ollama is reachable
  curl -s -o /dev/null --max-time 2 "$OLLAMA_URL" \
    || { echo "ERROR: no Ollama at $OLLAMA_URL — run 'ollama serve' (or open the Ollama app)." >&2; exit 1; }

  # Verify the model has been pulled
  ollama list | awk '{print $1}' | grep -q "^${OLLAMA_MODEL}" \
    || { echo "ERROR: model '$OLLAMA_MODEL' not pulled — run 'ollama pull $OLLAMA_MODEL'." >&2; exit 1; }

  # First run: generate local embeddings if neither index file exists
  if [ ! -f .opencrane/milvus.db ] && [ ! -f .opencrane/embeddings.json ]; then
    echo "==> No local index found; generating embeddings (one-time, takes a while)..."
    echo "    (This will also download the embedding model on the very first run.)"
    uvx opencrane embed
  fi
fi

# --- node deps for the dev server (tsx) --------------------------------------
[ -d node_modules ] || npm install

# --- index check (hosted mode): data/vectors.* come from the weekly refresh --
if [ "$MODE" = "--hosted" ] && [ ! -f data/vectors.bin ]; then
  echo "WARNING: data/vectors.bin not found." >&2
  echo "  The search_docs tool will return errors until the index is built:" >&2
  echo "    node scripts/embed.mjs --dry-run   # preview scope, no API calls" >&2
  echo "    npm run embed                      # build (needs AI_GATEWAY_API_KEY)" >&2
  echo ""
fi

cleanup() {
  trap - INT TERM EXIT
  echo ""
  echo "==> Stopping..."
  kill 0 2>/dev/null || true
}
trap cleanup INT TERM EXIT

wait_http() { # url name timeout_s — any HTTP response counts as up
  local i
  for i in $(seq 1 "$3"); do
    curl -s -o /dev/null --max-time 2 "$1" && return 0
    sleep 1
  done
  echo "ERROR: $2 did not come up within $3 s — see $LOG_DIR" >&2
  return 1
}

# ---------------------------------------------------------------------------
# Start services
# ---------------------------------------------------------------------------

if [ "$MODE" != "--hosted" ]; then
  echo "==> Starting OpenCrane MCP server on :$MCP_PORT (log: $LOG_DIR/mcp.log)"
  MILVUS_DB_PATH=.opencrane/milvus.db MCP_HTTP_PORT="$MCP_PORT" uvx opencrane serve --transport http >"$LOG_DIR/mcp.log" 2>&1 &
  wait_http "http://localhost:$MCP_PORT/mcp" "MCP server" 120

  # Inject offline env vars for the dev server
  export SEARCH_MCP_URL="http://localhost:$MCP_PORT/mcp"
  export CHAT_MODEL_BASE_URL="$OLLAMA_URL/v1"
  export CHAT_MODEL="$OLLAMA_MODEL"
  export CHAT_MODEL_API_KEY="ollama"
fi

echo "==> Starting dev server on :$CHAT_PORT (log: $LOG_DIR/dev-server.log)"
PORT="$CHAT_PORT" npx tsx scripts/dev-server.mjs >"$LOG_DIR/dev-server.log" 2>&1 &
wait_http "http://localhost:$CHAT_PORT" "dev server" 60

# ---------------------------------------------------------------------------
# Ready banner
# ---------------------------------------------------------------------------

echo ""
if [ "$MODE" = "--hosted" ]; then
  echo "Ready (hosted — AI Gateway inference, in-process search)."
else
  echo "Ready (offline — Ollama '$OLLAMA_MODEL' at $OLLAMA_URL, OpenCrane MCP at :$MCP_PORT)."
fi
echo "  Chat UI:   http://localhost:$CHAT_PORT"
echo "  Function:  http://localhost:$CHAT_PORT/api/chat"
echo "  MCP:       http://localhost:$CHAT_PORT/api/mcp"
if [ "$MODE" != "--hosted" ]; then
  echo "  Local MCP: http://localhost:$MCP_PORT/mcp"
fi
echo ""
echo "Ctrl-C stops everything (or ./scripts/stop-local.sh if detached)."
command -v open >/dev/null 2>&1 && open "http://localhost:$CHAT_PORT"
wait
