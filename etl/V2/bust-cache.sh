#!/usr/bin/env bash
# =============================================================================
# bust-cache.sh — Invalidate the Bamboo Reports dashboard Redis cache
#
# Calls POST /api/dashboard with a shared secret (ETL_CACHE_BUST_SECRET).
# This is a server-to-server call — no Supabase user session needed.
# The next user request will trigger a fresh DB fetch and re-populate Redis.
#
# Usage:
#   ./bust-cache.sh                        # uses vars from .env
#   APP_URL=https://myapp.vercel.app ./bust-cache.sh
#
# Required env vars (loaded from .env files if present):
#   APP_URL               — base URL of the deployed app, no trailing slash
#   ETL_CACHE_BUST_SECRET — shared secret set in the app's environment too
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Load .env files (ETL-local first, then repo root) ────────────────────────
for ENV_FILE in "$SCRIPT_DIR/.env" "$SCRIPT_DIR/../../.env"; do
    if [ -f "$ENV_FILE" ]; then
        set -o allexport
        # shellcheck disable=SC1090
        source <(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ENV_FILE")
        set +o allexport
    fi
done

# ── Validate required vars ───────────────────────────────────────────────────
if [ -z "${APP_URL:-}" ]; then
    echo "❌  APP_URL is not set." >&2
    echo "    Add it to etl/V2/.env:  APP_URL=https://your-app.vercel.app" >&2
    exit 1
fi

if [ -z "${ETL_CACHE_BUST_SECRET:-}" ]; then
    echo "❌  ETL_CACHE_BUST_SECRET is not set." >&2
    echo "    1. Generate one:  openssl rand -hex 32" >&2
    echo "    2. Add it to etl/V2/.env AND to your app's environment variables." >&2
    exit 1
fi

# Strip trailing slash
APP_URL="${APP_URL%/}"
ENDPOINT="${APP_URL}/api/dashboard"

# ── Check curl is available ──────────────────────────────────────────────────
if ! command -v curl > /dev/null 2>&1; then
    echo "❌  curl is required but was not found on PATH." >&2
    exit 1
fi

# ── Send the request ─────────────────────────────────────────────────────────
echo "🗑️   Busting dashboard cache at ${ENDPOINT} ..."

HTTP_STATUS=$(curl \
    --silent \
    --output /dev/null \
    --write-out "%{http_code}" \
    --request POST \
    --header "Authorization: Bearer ${ETL_CACHE_BUST_SECRET}" \
    --header "Content-Type: application/json" \
    --max-time 15 \
    "${ENDPOINT}"
)

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅  Cache invalidated (HTTP ${HTTP_STATUS})."
    echo "    Next request to /api/dashboard will fetch fresh data from Neon and warm Redis."
else
    echo "⚠️   Cache bust returned HTTP ${HTTP_STATUS}." >&2
    echo "    The ETL import succeeded — this is a non-fatal warning." >&2
    echo "    Redis cache will expire naturally after its TTL." >&2
    # Non-fatal — never block the ETL run
    exit 0
fi
