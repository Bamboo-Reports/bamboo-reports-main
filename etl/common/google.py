"""
Google Sheets access shared by the importer and the sheet tools: the
service-account key, an authorised gspread client, and a wrapper that
retries the API when it is rate limited or busy, and says so.

A large sheet recalculating its formulas (a VLOOKUP or FILTER over
thousands of rows) can freeze for minutes. The API then answers slowly,
fails with 500/503, or returns "Loading..." for formula cells that have no
value yet. Every call goes through safe_api_call(), and every full read
through read_settled(), so the run prints what it is waiting on instead of
sitting silent, and never treats "Loading..." as data.
"""

import threading
import time
from pathlib import Path

import gspread
import requests
from google.oauth2.service_account import Credentials

from common.env import ETL_DIR, GOOGLE_SA_FILE
from common.tui import ICONS, console

SCOPE_READONLY = "https://www.googleapis.com/auth/spreadsheets.readonly"
SCOPE_READWRITE = "https://www.googleapis.com/auth/spreadsheets"

# Seconds one request may take before it is abandoned and retried. Without
# a timeout a frozen sheet hangs the run for good.
HTTP_TIMEOUT = 180
# Say "still waiting" after this many seconds without an answer, then again
# every WAIT_REPEAT seconds.
WAIT_NOTICE = 15
WAIT_REPEAT = 30
# 429 is the rate limit. The 5xx codes are what a sheet busy recalculating
# usually returns; they pass once it settles.
RATE_LIMITED = 429
BUSY_CODES = {500, 502, 503, 504}
RETRY_DELAYS = [10, 20, 30, 60, 60]
# What a formula cell reads as while Sheets is still calculating it.
LOADING_VALUES = {"Loading...", "Loading…"}
SETTLE_DELAYS = [10, 15, 20, 30, 30, 60]


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


def authorize(credentials: Credentials) -> gspread.Client:
    """gspread.authorize() with a request timeout set."""
    client = gspread.authorize(credentials)
    client.http_client.set_timeout(HTTP_TIMEOUT)
    return client


def get_gspread_client(write: bool = False) -> gspread.Client:
    return authorize(get_credentials(write))


def waiting(what: str, seconds: float) -> None:
    console.print(
        f"  [warning]{ICONS['warn']} Still waiting on Google Sheets for {what} ({seconds:.0f}s).[/warning] "
        "[muted]The sheet is probably recalculating formulas. This is normal: "
        "nothing is wrong, and the run carries on by itself.[/muted]"
    )


def call_with_notice(func, what: str):
    """func() on a worker thread, printing a note while it is slow."""
    result: dict = {}

    def run() -> None:
        try:
            result["value"] = func()
        except BaseException as exc:  # handed back to the caller below
            result["error"] = exc

    worker = threading.Thread(target=run, daemon=True)
    started = time.monotonic()
    worker.start()
    next_notice = WAIT_NOTICE
    while True:
        worker.join(timeout=1)
        if not worker.is_alive():
            break
        elapsed = time.monotonic() - started
        if elapsed >= next_notice:
            waiting(what, elapsed)
            next_notice += WAIT_REPEAT
    if "error" in result:
        raise result["error"]
    return result["value"]


def status_code(exc: gspread.exceptions.APIError) -> int | None:
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    response = getattr(exc, "response", None)
    return getattr(response, "status_code", None)


def safe_api_call(func, what: str = "a response", idempotent: bool = True):
    """
    func() with the waiting and retries a busy sheet needs:
      - a note every so often while an answer is slow;
      - the rate limit (429) waited out and retried;
      - a busy sheet (500, 502, 503, 504) or a timed-out request retried
        with growing pauses, saying why.
    idempotent=False is for a request that must not run twice, such as
    deleting a column: a timed-out one may have gone through, so it is not
    retried. A 429 is retried either way, since Google rejected it unrun.
    """
    attempts = len(RETRY_DELAYS) + 1
    for attempt in range(1, attempts + 1):
        try:
            return call_with_notice(func, what)
        except gspread.exceptions.APIError as exc:
            code = status_code(exc)
            retryable = code == RATE_LIMITED or (code in BUSY_CODES and idempotent)
            if not retryable or attempt == attempts:
                raise
            reason = (
                "Rate limit reached"
                if code == RATE_LIMITED
                else f"Google Sheets is busy (HTTP {code}), probably recalculating formulas"
            )
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError):
            if not idempotent or attempt == attempts:
                raise
            reason = f"No answer within {HTTP_TIMEOUT}s, probably recalculating formulas"
        delay = RETRY_DELAYS[attempt - 1]
        console.print(
            f"  [warning]{ICONS['warn']} {reason}.[/warning] [muted]Retrying {what} in {delay}s "
            f"(try {attempt + 1} of {attempts}). Nothing is wrong.[/muted]"
        )
        time.sleep(delay)


class SheetNotSettled(RuntimeError):
    """Formula cells still said Loading... after every re-read."""


def count_loading(rows) -> int:
    """Cells that read "Loading..." in a list of rows."""
    return sum(1 for row in rows for value in row if str(value).strip() in LOADING_VALUES)


def read_settled(read, what: str, count=count_loading):
    """
    read() again until no cell says "Loading...", with a note each time, so
    a formula still being calculated is never taken as its value. Raises
    SheetNotSettled if the sheet has not settled after the last try.
    count(data) returns how many cells are still loading.
    """
    for attempt in range(len(SETTLE_DELAYS) + 1):
        data = safe_api_call(read, what)
        loading = count(data)
        if not loading:
            return data
        if attempt == len(SETTLE_DELAYS):
            break
        delay = SETTLE_DELAYS[attempt]
        console.print(
            f"  [warning]{ICONS['warn']} {loading:,} formula cell{'s' if loading != 1 else ''} in {what} still "
            f"{'say' if loading != 1 else 'says'} Loading...[/warning] [muted]The sheet is recalculating. Reading again in {delay}s "
            f"(try {attempt + 2} of {len(SETTLE_DELAYS) + 1}). Nothing is wrong.[/muted]"
        )
        time.sleep(delay)
    waited = sum(SETTLE_DELAYS)
    raise SheetNotSettled(
        f"{what}: {loading:,} formula cells still say Loading... after {waited // 60} minutes. "
        "The sheet has not finished recalculating; run again once it has (or reload it in the browser)."
    )
