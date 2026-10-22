"""What a phase reports, and the run order the summary lists."""

from dataclasses import dataclass

from common import tui


@dataclass
class PhaseResult:
    """What one phase found. errors fail the run; warnings do not."""

    label: str
    name: str
    errors: int = 0
    warnings: int = 0
    detail: str = ""
    # True when cleanup fixes this kind of issue, so the verdict can say so.
    fixable: bool = False

    @property
    def status(self) -> str:
        return tui.status_of(self.errors, self.warnings)


# Every phase in run order, so the summary can list the ones a failing
# phase stopped before they ran.
PHASES = [
    ("Phase 0", "Format"),
    ("Phase 0B", "Invisible characters"),
    ("Phase 0C", "Chips and dropdowns"),
    ("Phase 0D", "Look-alike letters"),
    ("Phase 1", "Uniqueness"),
    ("Phase 2", "References"),
    ("Phase 2B", "Completeness"),
    ("Phase 2C", "Engagement flags"),
    ("Phase 3", "Service coverage"),
]


def problem_kind(message: str) -> str:
    """'Invalid email: x@y' -> 'Invalid email'. Groups issues for the
    most-common breakdown."""
    return message.split(":", 1)[0]
