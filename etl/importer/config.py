"""Settings for the importer: database targets, file locations, the audit
tables and a few column names the change tracking relies on."""

import os

import common.env  # noqa: F401  (loads etl/.env before the getenv calls below)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Dev and prod connection strings live side by side in the .env. --target
# picks one at startup (default dev), so prod is only written when named.
DATABASE_URLS = {
    "dev": os.getenv("DATABASE_URL_DEV"),
    "prod": os.getenv("DATABASE_URL_PROD"),
}

CHUNKSIZE = 1000
RETENTION_DAYS = 90
SCHEMA_FILE = os.path.join(BASE_DIR, "master-schema.json")
IMPORT_LOG_ROOT = os.path.join(BASE_DIR, "import_logs")
LOG_OUTPUT_DIR = os.path.join(IMPORT_LOG_ROOT, "logs")
SNAPSHOT_OUTPUT_DIR = os.path.join(IMPORT_LOG_ROOT, "snapshot")

ACCOUNT_UUID_COLUMN = "uuid"
ACCOUNT_KEY_COLUMN = "account_global_legal_name"
IMPORT_SOURCE = "google_sheets_weekly_refresh"

NOTIFICATION_SCHEMA = "audit"
IMPORT_RUNS_TABLE = f"{NOTIFICATION_SCHEMA}.import_runs"
CHANGE_EVENTS_TABLE = f"{NOTIFICATION_SCHEMA}.field_change_events"
NOTIFICATION_READS_TABLE = f"{NOTIFICATION_SCHEMA}.notification_reads"
USER_NOTIFICATION_STATE_TABLE = f"{NOTIFICATION_SCHEMA}.user_notification_state"

ROW_ADDED_FIELD = "__row_added__"
ROW_REMOVED_FIELD = "__row_removed__"
