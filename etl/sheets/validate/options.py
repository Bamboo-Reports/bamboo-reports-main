"""Options for one validate run, set by the CLI before any phase runs."""

# Rows shown per detail table (--limit).
detail_limit = 20

# --highlight: colour the failing rows and cells in the sheet after the run.
highlight = False

# Named in messages that ask for the sheet to be shared with it.
service_account_email = ""

# Sheets skipped in every phase (--exclude).
EXCLUDED_SHEETS: set[str] = set()


def is_excluded(sheet_name: str) -> bool:
    return sheet_name.strip().lower() in EXCLUDED_SHEETS
