# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "gspread",
#     "google-auth",
# ]
# ///
import argparse
import re
import sys
from pathlib import Path

import gspread
from google.auth.exceptions import GoogleAuthError
from google.oauth2.service_account import Credentials
from gspread.utils import a1_to_rowcol, rowcol_to_a1


SCRIPT_DIR = Path(__file__).resolve().parent
SPREADSHEET_ID = "1Au4sjSHR9mMMrrgNteP-1_2t8JbByHbI8BMI2ugsTvg"
SERVICE_ACCOUNT_FILE = SCRIPT_DIR / "bamboo-reports-f3d45a15c2ce.json"
DEFAULT_SHEET_NAME = "SM"
DEFAULT_TARGET_COLUMNS = ["K", "M", "O", "Q", "S", "U", "W", "Y", "AA", "AC"]
FIRST_DATA_ROW = 2
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
LEADING_DASH = re.compile(r"^[ \t]*-[ \t]+", re.MULTILINE)
UPDATE_BATCH_SIZE = 500


def remove_leading_dashes(value: str) -> str:
    """Remove a dash and following spaces from the start of each line."""
    return LEADING_DASH.sub("", value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Remove leading '- ' markers from lines in the given sheet columns. "
            "Runs as a dry run unless --apply is given."
        )
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually update the spreadsheet. Without this flag, only reports.",
    )
    parser.add_argument(
        "--sheet",
        default=DEFAULT_SHEET_NAME,
        help=f"Worksheet name to clean (default: {DEFAULT_SHEET_NAME}).",
    )
    parser.add_argument(
        "--columns",
        default=",".join(DEFAULT_TARGET_COLUMNS),
        help=(
            "Comma-separated column letters to clean "
            f"(default: {','.join(DEFAULT_TARGET_COLUMNS)})."
        ),
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    sheet_name = args.sheet
    target_columns = [c.strip().upper() for c in args.columns.split(",") if c.strip()]
    if not target_columns:
        print("Error: --columns must list at least one column letter.")
        return 1
    target_column_numbers = {
        a1_to_rowcol(f"{letter}1")[1]: letter for letter in target_columns
    }
    fetch_start_column = min(target_column_numbers)
    fetch_end_column = max(target_column_numbers)

    try:
        credentials = Credentials.from_service_account_file(
            str(SERVICE_ACCOUNT_FILE), scopes=SCOPES
        )
        client = gspread.authorize(credentials)
        spreadsheet = client.open_by_key(SPREADSHEET_ID)
        worksheet = spreadsheet.worksheet(sheet_name)
    except gspread.exceptions.WorksheetNotFound:
        print(f"Error: Worksheet '{sheet_name}' not found.")
        return 1
    except (
        OSError,
        ValueError,
        GoogleAuthError,
        gspread.exceptions.GSpreadException,
    ) as error:
        print(f"Error: Could not open the spreadsheet: {error}")
        return 1

    header = worksheet.row_values(1)
    print(f"Spreadsheet: {spreadsheet.title}")
    print(f"Worksheet:   {sheet_name}")
    print("Columns that will be touched:")
    for column_number in sorted(target_column_numbers):
        letter = target_column_numbers[column_number]
        name = header[column_number - 1] if column_number <= len(header) else ""
        display = " / ".join(name.splitlines()) if name else "(no header)"
        print(f"  {letter}: {display}")
    print()

    values = worksheet.get(
        f"{target_column_numbers[fetch_start_column]}{FIRST_DATA_ROW}"
        f":{target_column_numbers[fetch_end_column]}"
    )
    updates = []

    for row_offset, row in enumerate(values):
        sheet_row = FIRST_DATA_ROW + row_offset
        for column_offset, value in enumerate(row):
            column_number = fetch_start_column + column_offset
            if column_number not in target_column_numbers:
                continue
            if not isinstance(value, str):
                continue

            cleaned_value = remove_leading_dashes(value)
            if cleaned_value == value:
                continue

            cell_address = rowcol_to_a1(sheet_row, column_number)
            updates.append(
                {"range": cell_address, "values": [[cleaned_value]]}
            )
            print(f"Found leading dash: {sheet_name}!{cell_address}")

    if not updates:
        print(
            f"No leading '- ' markers found in {sheet_name} columns "
            f"{', '.join(target_columns)}."
        )
        return 0

    if not args.apply:
        print(
            f"Dry run complete: {len(updates)} cell(s) would be updated. "
            "Re-run with --apply to write the changes."
        )
        return 0

    try:
        for start in range(0, len(updates), UPDATE_BATCH_SIZE):
            worksheet.batch_update(updates[start : start + UPDATE_BATCH_SIZE])
    except gspread.exceptions.GSpreadException as error:
        print(f"Error: Could not update the spreadsheet: {error}")
        return 1

    print(
        f"Updated {len(updates)} cell(s) in {sheet_name} columns "
        f"{', '.join(target_columns)}."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
