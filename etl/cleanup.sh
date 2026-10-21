#!/usr/bin/env bash
# Cleans the source Google Sheet in one ordered pass (python -m sheets.cleanup).
# Dry run unless --apply is given. Run from anywhere: etl/cleanup.sh --help
set -euo pipefail

ETL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat <<'EOF'
Usage: etl/cleanup.sh [options]

Fixes what can be fixed automatically in the source Google Sheet, so
etl/validate.sh only reports what needs a person. Dry run by default.

Options:
  --apply              Write the changes to the sheet (shows the report, then asks y/N).
  --yes                With --apply, write without asking (needed when not run from a terminal).
  --steps a,b          Only run these steps.
  --skip a,b           Run every step except these.
  --sheets a,b         Only change these sheets (others are still read where a step needs them).
                       Sheets: accounts, centers, services, prospects, ticker,
                       alias, functions, tech, subscribers.
  --report FILE.csv    Write every change to a CSV file for review.
  --limit N            Example rows shown per step (default 10, 0 hides them).
  -h, --help           Show this help.

Steps, always run in this order:
  chips        smart chips to plain text, dropdowns removed
  artifacts    #N/A and #REF! typed as text cleared, HTML entities decoded
  invisible    zero-width characters, BOMs, soft hyphens stripped
  whitespace   trims, double spaces, tabs and exotic spaces
  lists        list columns: one item per line, no bullets or duplicates
  links        link columns: one clean URL per line
  formats      dates, months, years, choices, ISO codes, emails, phones, names
  references   child-sheet keys take the parent sheet's exact spelling

Examples:
  etl/cleanup.sh                               # preview every step
  etl/cleanup.sh --report changes.csv          # preview, full list as CSV
  etl/cleanup.sh --apply                       # write after you confirm
  etl/cleanup.sh --steps formats --sheets centers

Typical order: etl/cleanup.sh, etl/cleanup.sh --apply, etl/validate.sh, etl/import.sh.
EOF
}

for arg in "$@"; do
    case "$arg" in
        -h|--help) usage; exit 0 ;;
    esac
done

if ! command -v uv >/dev/null 2>&1; then
    echo "Error: uv is required but was not found on PATH." >&2
    echo "Install it from https://docs.astral.sh/uv/getting-started/installation/" >&2
    exit 1
fi

# --report paths are relative to where you ran the script, not etl/.
args=()
while [ $# -gt 0 ]; do
    case "$1" in
        --report)
            if [ $# -lt 2 ]; then echo "Error: --report needs a file name. See --help." >&2; exit 2; fi
            args+=("$1" "$(realpath -m -- "$2")"); shift 2; continue ;;
        --report=*) args+=("--report=$(realpath -m -- "${1#--report=}")") ;;
        *) args+=("$1") ;;
    esac
    shift
done

exec uv run --directory "$ETL_DIR" --locked python -m sheets.cleanup "${args[@]+"${args[@]}"}"
