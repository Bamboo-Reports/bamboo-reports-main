#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"
REQUIREMENTS="$SCRIPT_DIR/requirements.txt"
STAMP="$VENV_DIR/.requirements.sha256"
PYTHON_BIN="$VENV_DIR/bin/python"

if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required but was not found on PATH." >&2
    exit 1
fi

if [ ! -d "$VENV_DIR" ] || [ ! -x "$PYTHON_BIN" ]; then
    echo "Creating virtualenv at $VENV_DIR"
    python3 -m venv "$VENV_DIR"
fi

if [ ! -f "$REQUIREMENTS" ]; then
    echo "Error: requirements.txt not found at $REQUIREMENTS" >&2
    exit 1
fi

CURRENT_HASH="$(sha256sum "$REQUIREMENTS" | awk '{print $1}')"
if [ ! -f "$STAMP" ] || [ "$(cat "$STAMP")" != "$CURRENT_HASH" ]; then
    echo "Installing requirements"
    "$PYTHON_BIN" -m pip install --upgrade pip >/dev/null
    "$PYTHON_BIN" -m pip install -r "$REQUIREMENTS"
    echo "$CURRENT_HASH" > "$STAMP"
fi

# Run the ETL (not exec — so the cache bust below can run after it)
"$PYTHON_BIN" "$SCRIPT_DIR/main.py" "$@"
ETL_EXIT=$?

# Bust the dashboard Redis cache so users see fresh data immediately.
# Only runs when the import succeeded (exit 0) and APP_URL is set.
# bust-cache.sh is itself non-fatal — it will never fail this script.
if [ "$ETL_EXIT" -eq 0 ] && [ -n "${APP_URL:-}" ]; then
    bash "$SCRIPT_DIR/bust-cache.sh"
elif [ "$ETL_EXIT" -eq 0 ]; then
    echo "ℹ️   APP_URL not set — skipping cache bust (Redis will expire naturally)."
fi

exit "$ETL_EXIT"
