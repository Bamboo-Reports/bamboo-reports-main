"""Run logging: the per-run log file, console status lines, and the list of
stages the closing summary reports."""

import datetime
import logging
import os
from typing import List

from common import tui

from .config import LOG_OUTPUT_DIR, SNAPSHOT_OUTPUT_DIR

# Every module logs here; setup_logger() attaches the handlers once per run.
logger = logging.getLogger("data_manager")

# This run's log file, set by setup_logger().
LOG_FILE = ""

# (stage, status, detail) for the closing summary, in the order stages run.
STAGES: List[tuple] = []


def record_stage(name: str, status: str, detail: str) -> None:
    STAGES.append((name, status, detail))


class TuiLogHandler(logging.Handler):
    """Shows log records as tui status lines. Tracebacks stay in the log
    file; the console gets the message and the closing panel names the file."""

    def emit(self, record: logging.LogRecord) -> None:
        try:
            if record.levelno >= logging.ERROR:
                status = "fail"
            elif record.levelno >= logging.WARNING:
                status = "warn"
            elif record.levelno >= logging.INFO:
                status = "info"
            else:
                status = "skip"
            tui.line(status, record.getMessage())
        except Exception:
            self.handleError(record)


def setup_logger(verbose: bool = False) -> str:
    """Attaches the console and file handlers and opens this run's log file."""
    global LOG_FILE
    os.makedirs(LOG_OUTPUT_DIR, exist_ok=True)
    os.makedirs(SNAPSHOT_OUTPUT_DIR, exist_ok=True)

    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = os.path.join(LOG_OUTPUT_DIR, f"log_{timestamp}.txt")
    LOG_FILE = log_file

    logger.setLevel(logging.DEBUG)
    logger.handlers.clear()

    # Console: status lines in the shared look. Debug detail only with -v.
    console_handler = TuiLogHandler(level=logging.DEBUG if verbose else logging.INFO)
    logger.addHandler(console_handler)

    # File handler
    fmt = logging.Formatter("%(asctime)s | %(levelname)s | %(message)s")
    file_handler = logging.FileHandler(log_file, encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(fmt)
    logger.addHandler(file_handler)

    logger.debug(f"Log file: {log_file}")
    return log_file
