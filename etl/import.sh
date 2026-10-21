#!/usr/bin/env bash
# Imports the source Google Sheet into Postgres (python -m importer).
# Targets dev unless --target prod. Run from anywhere: etl/import.sh --help
set -euo pipefail

ETL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat <<'EOF'
Usage: etl/import.sh [options]

With no mode flag: headers -> import -> indexes -> snapshot -> schema check.

Database:
  --target dev|prod    Database to use (default dev). Prod asks to confirm before writing.
  --yes                With --target prod, write without asking (needed when not run from a terminal).
  --no-purge           Prod import without purging the dashboard cache (dev never purges).

Modes (combine as needed):
  --import             Import, then snapshot.
  --dry-run            Full import pipeline with diffing, nothing written.
  --check-headers      Compare sheet headers with master-schema.json only.
  --validate           Compare database columns and types with master-schema.json.
  --schema             Snapshot table stats to etl/importer/import_logs/snapshot/.
  --index              Re-apply indexes (and ANALYZE).

Scope and output:
  -t, --table NAME     Only this table (accounts, ticker, alias, centers, services,
                       functions, tech, prospects, subscribers).
  -v, --verbose        Show debug logging on screen too.
  -h, --help           Show this help.

Examples:
  etl/import.sh --dry-run                  # preview a dev import
  etl/import.sh                            # full import into dev
  etl/import.sh --target prod --dry-run    # preview against prod
  etl/import.sh --target prod              # weekly prod import (asks to confirm)
EOF
}

target="dev"
writes=1          # the default run (no mode flag) writes
dry_run=0
assume_yes=0
pass=()

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help) usage; exit 0 ;;
        --yes) assume_yes=1; shift; continue ;;
        --target)
            if [ $# -lt 2 ]; then echo "Error: --target needs dev or prod." >&2; exit 2; fi
            target="$2"; pass+=("$1" "$2"); shift 2; continue ;;
        --target=*) target="${1#--target=}" ;;
        --dry-run) dry_run=1 ;;
        --import|--index) ;;
        --validate|--schema|--check-headers) writes=0 ;;
    esac
    pass+=("$1")
    shift
done

case "$target" in
    dev|prod) ;;
    *) echo "Error: --target must be dev or prod, got '$target'." >&2; exit 2 ;;
esac

# --import/--index write even when combined with read-only modes.
for a in "${pass[@]+"${pass[@]}"}"; do
    case "$a" in --import|--index) writes=1 ;; esac
done
if [ $dry_run -eq 1 ]; then writes=0; fi

if [ "$target" = "prod" ] && [ $writes -eq 1 ] && [ $assume_yes -eq 0 ]; then
    if [ ! -t 0 ]; then
        echo "Error: this writes to PROD. Pass --yes to run without a terminal to confirm on." >&2
        exit 1
    fi
    read -r -p "This writes to the PROD database. Continue? [y/N] " reply
    case "$reply" in
        y|Y|yes|YES) ;;
        *) echo "Cancelled. Nothing was written."; exit 1 ;;
    esac
fi

if ! command -v uv >/dev/null 2>&1; then
    echo "Error: uv is required but was not found on PATH." >&2
    echo "Install it from https://docs.astral.sh/uv/getting-started/installation/" >&2
    exit 1
fi

exec uv run --directory "$ETL_DIR" --locked python -m importer "${pass[@]+"${pass[@]}"}"
