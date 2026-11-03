#!/usr/bin/env bash
# Replaces the main sheet's accounts, centers and services rows with another
# spreadsheet's, by its profile (python -m sheets.sync). Dry run unless --apply.
set -euo pipefail

ETL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    cat <<'USAGE'
Usage: etl/sync.sh --source NAME [options]

Replaces the rows of the main sheet's accounts, centers and services with
the rows of the spreadsheet described by etl/sources/NAME.toml, so they do
not have to be copied over by hand. Dry run by default.

Each of our columns is copied from their sheet (by the profile's mapping),
filled down from our row-2 formula, filled with the one value every row has
(account_source, center_country_iso2), or left blank (lat, lng, and the
profile's [sync] skip list, such as cn_unique_key).

Options:
  --source NAME        The profile to copy from, such as data-team. Required.
  --apply              Back up the main spreadsheet, then write (asks y/N first).
                       Needs BACKUP_FOLDER_ID in etl/.env.
  --yes                With --apply, write without asking.
  --sheets a,b         Only these sheets (default: every sheet the profile has).
  --limit N            Examples shown per sheet (default 8).
  -h, --help           Show this help.

Typical order:
  etl/cleanup.sh --source data-team --apply
  etl/validate.sh --source data-team --force     # must pass
  etl/sync.sh --source data-team                 # preview
  etl/sync.sh --source data-team --apply
  (fill the blank columns)  etl/validate.sh  etl/import.sh
USAGE
}

for arg in "$@"; do
    case "$arg" in -h|--help) usage; exit 0 ;; esac
done

if ! command -v uv >/dev/null 2>&1; then
    echo "Error: uv is required but was not found on PATH." >&2
    exit 1
fi

exec uv run --directory "$ETL_DIR" --locked python -m sheets.sync "$@"
