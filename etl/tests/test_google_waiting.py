"""Waiting on a busy sheet: slow answers, 5xx retries, and "Loading..." cells."""

import time

import gspread
import pytest
import requests

from common import google


def api_error(code: int) -> gspread.exceptions.APIError:
    response = requests.Response()
    response.status_code = code
    response._content = f'{{"error": {{"code": {code}, "message": "busy", "status": "UNAVAILABLE"}}}}'.encode()
    return gspread.exceptions.APIError(response)


@pytest.fixture(autouse=True)
def fast(monkeypatch):
    """No real pauses: every delay becomes zero, notices come quickly."""
    monkeypatch.setattr(google, "RETRY_DELAYS", [0, 0, 0])
    monkeypatch.setattr(google, "SETTLE_DELAYS", [0, 0])
    monkeypatch.setattr(google, "WAIT_NOTICE", 1)
    monkeypatch.setattr(google, "WAIT_REPEAT", 1)
    monkeypatch.setattr(google.time, "sleep", lambda _s: None)


def flaky(*outcomes):
    """A call that raises or returns each outcome in turn."""
    calls = iter(outcomes)

    def call():
        outcome = next(calls)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    return call


def printed(capsys) -> str:
    return capsys.readouterr().out


def test_a_busy_sheet_is_retried_and_says_why(capsys):
    assert google.safe_api_call(flaky(api_error(503), api_error(500), "rows"), "tab 'BR'") == "rows"
    out = printed(capsys)
    assert "busy (HTTP 503)" in out and "busy (HTTP 500)" in out
    assert "recalculating formulas" in out and "Nothing is wrong" in out


def test_a_timeout_is_retried(capsys):
    assert google.safe_api_call(flaky(requests.exceptions.ReadTimeout(), "rows")) == "rows"
    assert "No answer within" in printed(capsys)


def test_gives_up_after_the_last_try():
    with pytest.raises(gspread.exceptions.APIError):
        google.safe_api_call(flaky(*[api_error(503)] * 10))


def test_other_errors_are_not_retried():
    with pytest.raises(gspread.exceptions.APIError):
        google.safe_api_call(flaky(api_error(403), "never reached"))


def test_a_delete_is_not_retried_after_a_timeout():
    # It may have gone through; a second run would delete the next column.
    with pytest.raises(requests.exceptions.ReadTimeout):
        google.safe_api_call(flaky(requests.exceptions.ReadTimeout(), "x"), idempotent=False)
    with pytest.raises(gspread.exceptions.APIError):
        google.safe_api_call(flaky(api_error(503), "x"), idempotent=False)


def test_a_rate_limit_is_retried_even_for_a_delete():
    assert google.safe_api_call(flaky(api_error(429), "done"), idempotent=False) == "done"


def test_a_slow_answer_prints_that_it_is_still_waiting(capsys, monkeypatch):
    monkeypatch.undo()  # real join timing for this one
    monkeypatch.setattr(google, "WAIT_NOTICE", 1)
    monkeypatch.setattr(google, "WAIT_REPEAT", 60)

    def slow():
        time.sleep(1.6)
        return "rows"

    assert google.safe_api_call(slow, "tab 'CM'") == "rows"
    out = printed(capsys)
    assert "Still waiting on Google Sheets for tab 'CM'" in out
    assert "recalculating formulas" in out


def test_loading_cells_are_read_again_until_settled(capsys):
    read = flaky([["a", "Loading..."]], [["a", "Loading…"]], [["a", "b"]])
    assert google.read_settled(read, "tab 'SM'") == [["a", "b"]]
    out = printed(capsys)
    assert "1 formula cell in tab 'SM' still says Loading..." in out


def test_a_sheet_that_never_settles_stops_the_run():
    read = flaky(*[[["Loading..."]]] * 5)
    with pytest.raises(google.SheetNotSettled, match="still say Loading"):
        google.read_settled(read, "tab 'BR'")


def test_loading_is_only_the_whole_cell():
    assert google.count_loading([["Loading...", " Loading… ", "Loading data", ""]]) == 2
