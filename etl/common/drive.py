"""
Google Drive access for backups: a full copy of a spreadsheet (every tab,
formula and format) into a dated folder.

    <BACKUP_FOLDER_ID>/Backups/2026-11/2026-11-03 13-05 <spreadsheet title>

The service account has no Drive storage of its own, so the backup folder
must be in a Shared Drive the service account is a member of: files there
belong to the Shared Drive. In a My Drive folder the copy fails with a
storage quota error, and the caller must not write anything then.
"""

from datetime import datetime

from google.auth.transport.requests import AuthorizedSession

from common.google import SCOPE_DRIVE, get_credentials, service_account_path

API = "https://www.googleapis.com/drive/v3/files"
FOLDER = "application/vnd.google-apps.folder"
COMMON = {"supportsAllDrives": "true"}


class BackupFailed(RuntimeError):
    """The backup copy could not be made; nothing may be written."""


def _session() -> AuthorizedSession:
    return AuthorizedSession(get_credentials(scopes=[SCOPE_DRIVE]))


def _check(response, doing: str) -> dict:
    if response.ok:
        return response.json()
    try:
        error = response.json().get("error", {})
        reason = (error.get("errors") or [{}])[0].get("reason", "")
        message = error.get("message", response.text)
    except ValueError:
        reason, message = "", response.text
    hint = ""
    if response.status_code == 404:
        hint = " Share the backup folder with the service account (Content manager)."
    elif "storageQuota" in reason or "quota" in message.lower():
        hint = (
            " The service account has no Drive storage of its own: put the backup folder in a"
            " Shared Drive and add the service account as a member."
        )
    raise BackupFailed(f"{doing}: HTTP {response.status_code} {message.rstrip('.')}.{hint}")


def _folder(session: AuthorizedSession, parent: str, name: str) -> str:
    """The id of folder `name` under `parent`, created if missing."""
    query = f"name = '{name}' and '{parent}' in parents and mimeType = '{FOLDER}' and trashed = false"
    found = _check(
        session.get(
            API,
            params={**COMMON, "q": query, "fields": "files(id)", "includeItemsFromAllDrives": "true"},
        ),
        f"Looking for folder '{name}'",
    )["files"]
    if found:
        return found[0]["id"]
    created = _check(
        session.post(API, params=COMMON, json={"name": name, "mimeType": FOLDER, "parents": [parent]}),
        f"Creating folder '{name}'",
    )
    return created["id"]


def backup_spreadsheet(spreadsheet_id: str, title: str, folder_id: str, now: datetime | None = None) -> str:
    """Copy the spreadsheet into folder_id/Backups/YYYY-MM/ and return the
    copy's URL. Raises BackupFailed with a readable reason."""
    service_account_path()  # clear error first if the key file is missing
    now = now or datetime.now()
    session = _session()
    _check(
        session.get(f"{API}/{folder_id}", params={**COMMON, "fields": "id"}),
        "Opening the backup folder",
    )
    month = _folder(session, _folder(session, folder_id, "Backups"), now.strftime("%Y-%m"))
    name = f"{now:%Y-%m-%d %H-%M} {title}"
    copy = _check(
        session.post(f"{API}/{spreadsheet_id}/copy", params={**COMMON, "fields": "id"}, json={"name": name, "parents": [month]}),
        "Copying the spreadsheet",
    )
    return f"https://docs.google.com/spreadsheets/d/{copy['id']}/edit"
