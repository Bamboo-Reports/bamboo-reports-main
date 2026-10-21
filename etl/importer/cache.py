"""Purge of the web app's dashboard response cache (Upstash Redis, keys
dash:*) after a prod import, so the new data shows immediately."""

import json
import os
import urllib.request
from typing import Any, List

from common import tui

from .logs import record_stage

# ── Main ─────────────────────────────────────────────────────────────────────


def _redis_command(url: str, token: str, command: List[Any]) -> Any:
    """Runs one Upstash Redis REST command and returns its result."""
    req = urllib.request.Request(
        url,
        data=json.dumps(command).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if isinstance(body, dict) and body.get("error"):
        raise RuntimeError(body["error"])
    return body.get("result") if isinstance(body, dict) else None


def purge_dashboard_cache():
    """Deletes the app's cached dashboard responses (keys dash:*) in Upstash.

    The web app caches filter-state responses in a shared Redis with a TTL.
    Purging right after an import makes the new data visible immediately
    instead of after the TTL. Optional: skipped when the env vars are unset,
    and never fails the import on error.
    """
    url = os.getenv("UPSTASH_REDIS_REST_URL") or os.getenv("KV_REST_API_URL")
    token = os.getenv("UPSTASH_REDIS_REST_TOKEN") or os.getenv("KV_REST_API_TOKEN")
    if not url or not token:
        tui.section("Cache · dashboard responses")
        tui.line("skip", "Cache purge skipped: UPSTASH_REDIS_REST_URL/TOKEN not set.")
        record_stage("Cache purge", "skip", "not configured")
        return
    tui.section("Cache · dashboard responses")
    try:
        deleted = 0
        cursor = "0"
        while True:
            result = _redis_command(url, token, ["SCAN", cursor, "MATCH", "dash:*", "COUNT", 1000])
            cursor, keys = str(result[0]), result[1]
            if keys:
                deleted += int(_redis_command(url, token, ["DEL", *keys]) or 0)
            if cursor == "0":
                break
        tui.line("pass", f"Dashboard cache purged: {tui.plural(deleted, 'cached response')} removed.")
        record_stage("Cache purge", "pass", f"{tui.plural(deleted, 'cached response')} removed")
    except Exception as e:
        tui.line("warn", f"Cache purge failed (import unaffected; cache expires by TTL): {e}")
        record_stage("Cache purge", "warn", "failed; cache expires by TTL")
