#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v uv >/dev/null 2>&1; then
    echo "Error: uv is required but was not found on PATH." >&2
    echo "Install it from https://docs.astral.sh/uv/getting-started/installation/" >&2
    exit 1
fi

if [ ! -f "$SCRIPT_DIR/pyproject.toml" ]; then
    echo "Error: pyproject.toml not found at $SCRIPT_DIR/pyproject.toml" >&2
    exit 1
fi

# main_cache_purge.py is the primary entry: same import as main.py plus a purge
# of the app's dashboard response cache (Upstash Redis) after a successful run.
# main.py is kept as a no-purge backup, runnable directly with uv run if needed.
exec uv run --project "$SCRIPT_DIR" --locked python "$SCRIPT_DIR/main_cache_purge.py" "$@"
