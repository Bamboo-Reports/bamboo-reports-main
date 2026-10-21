#!/usr/bin/env bash
# Checks the source Google Sheet before an import (python -m sheets.validate).
# Read-only unless --highlight is given. Run from anywhere: etl/validate.sh --help
set -euo pipefail

ETL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat <<'EOF'
Usage: etl/validate.sh [options]

Checks the source Google Sheet in phases (format, invisible characters,
chips and dropdowns, uniqueness, references, completeness, engagement flags,
service coverage). Stops at the first failing phase unless --force.

Options:
  --force              Run every phase instead of stopping at the first failure.
  --limit N            Rows shown in each detail table (default 20).
  --exclude a,b,c      Skip these sheets in every phase (results are partial).
                       Sheets: accounts, centers, services, prospects, ticker,
                       alias, functions, tech, subscribers.
  --highlight          Colour failing rows (yellow) and cells (red) in the sheet.
                       Writes to the sheet; combine with --force to cover every phase.
  -h, --help           Show this help.

Exit code is 1 when any phase has errors, 0 otherwise.

Fix what can be fixed automatically first:
  uv run --directory etl python -m sheets.cleanup            # preview
  uv run --directory etl python -m sheets.cleanup --apply    # write
EOF
}

# validate reads sys.argv directly and ignores unknown flags, so check them here.
args=("$@")
i=0
while [ $i -lt ${#args[@]} ]; do
    arg="${args[$i]}"
    case "$arg" in
        -h|--help) usage; exit 0 ;;
        --force|--highlight) ;;
        --limit|--exclude)
            if [ $((i + 1)) -ge ${#args[@]} ] || [[ "${args[$((i + 1))]}" == --* ]]; then
                echo "Error: $arg needs a value. See --help." >&2
                exit 2
            fi
            i=$((i + 1))
            ;;
        --limit=*|--exclude=*) ;;
        *) echo "Error: unknown option '$arg'. See --help." >&2; exit 2 ;;
    esac
    i=$((i + 1))
done

if ! command -v uv >/dev/null 2>&1; then
    echo "Error: uv is required but was not found on PATH." >&2
    echo "Install it from https://docs.astral.sh/uv/getting-started/installation/" >&2
    exit 1
fi

exec uv run --directory "$ETL_DIR" --locked python -m sheets.validate "$@"
