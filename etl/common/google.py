"""
Google Sheets access shared by the importer and the sheet tools: the
service-account key, an authorised gspread client, and a retry wrapper for
the API's rate limits.
"""

import time
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials

from common.env import ETL_DIR, GOOGLE_SA_FILE
from common.tui import console

SCOPE_READONLY = "https://www.googleapis.com/auth/spreadsheets.readonly"
SCOPE_READWRITE = "https://www.googleapis.com/auth/spreadsheets"


def service_account_path() -> Path:
    """GOOGLE_SA_FILE, absolute or relative to etl/."""
    if not GOOGLE_SA_FILE:
        raise ValueError("GOOGLE_SA_FILE not set in etl/.env")
    path = Path(GOOGLE_SA_FILE)
    if not path.is_absolute():
        path = ETL_DIR / path
    if not path.exists():
        raise FileNotFoundError(f"Service account file needed at: {path}")
    return path


def get_credentials(write: bool = False) -> Credentials:
    """Service-account credentials. Read-only unless write is set."""
    scope = SCOPE_READWRITE if write else SCOPE_READONLY
    return Credentials.from_service_account_file(str(service_account_path()), scopes=[scope])


def get_gspread_client(write: bool = False) -> gspread.Client:
    return gspread.authorize(get_credentials(write))


def safe_api_call(func):
    """Retry wrapper for Google Sheets API rate limits."""
    retries = 3
    while retries > 0:
        try:
            return func()
        except gspread.exceptions.APIError as e:
            if "429" in str(e) and retries > 1:
                console.print("  [muted]...API rate limit reached, cooling down for 10s...[/muted]")
                time.sleep(10)
                retries -= 1
            else:
                raise
