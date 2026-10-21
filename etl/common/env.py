"""
Environment shared by every ETL tool.

All settings come from one file, etl/.env (see etl/.env.example). It is read
once, on the first import of this module; values already set in the shell
take precedence.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from common.tui import console

# etl/, the root of the uv project. Relative paths in the .env resolve here.
ETL_DIR = Path(__file__).resolve().parent.parent

load_dotenv(ETL_DIR / ".env")

SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
GOOGLE_SA_FILE = os.getenv("GOOGLE_SA_FILE")


def require(*names: str) -> None:
    """Exit with a clear message when any of these variables is unset."""
    missing = [name for name in names if not os.getenv(name)]
    if missing:
        console.print(f"[error]Not set in etl/.env: {', '.join(missing)}[/]")
        sys.exit(1)
