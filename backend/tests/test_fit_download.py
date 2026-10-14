"""FIT downloads: find the URL in COROS's reply and refuse anything that isn't a FIT file, with
an error that says why. URLs and IDs here are made up."""

import asyncio
from datetime import UTC, datetime

import httpx
import pytest

from health.sources.coros import sync
from tests.fitwriter import synthetic_run

REPLY = (
    "Activity FIT file download URL(s):\n1. 111222333.fit\n"
    "   https://s3.coros.com/fit/999000/111222333.fit\n"
)
_REAL = httpx.AsyncClient


def _serve(monkeypatch, status: int, body: bytes, ctype: str = "application/octet-stream"):
    def handler(request):
        return httpx.Response(status, content=body, headers={"content-type": ctype})

    monkeypatch.setattr(
        sync.httpx, "AsyncClient", lambda **kw: _REAL(transport=httpx.MockTransport(handler), **kw)
    )


def test_url_is_found_in_the_reply():
    assert sync.fit_url(REPLY) == "https://s3.coros.com/fit/999000/111222333.fit"
    with pytest.raises(sync.FitDownloadError, match="no FIT URL"):
        sync.fit_url("Daily FIT download limit reached, try again tomorrow")


def test_download_accepts_a_fit_file(monkeypatch):
    data = synthetic_run(datetime(2026, 10, 1, 7, tzinfo=UTC), minutes=5)
    _serve(monkeypatch, 200, data)
    assert asyncio.run(sync.fetch_fit("https://s3.coros.com/fit/999000/111222333.fit")) == data


def test_download_errors_say_what_came_back(monkeypatch):
    _serve(monkeypatch, 403, b"<Error><Code>AccessDenied</Code></Error>", "application/xml")
    with pytest.raises(sync.FitDownloadError, match="HTTP 403.*AccessDenied"):
        asyncio.run(sync.fetch_fit("https://s3.coros.com/fit/1/2.fit"))
    _serve(monkeypatch, 200, b"<html>please log in</html>", "text/html")
    with pytest.raises(sync.FitDownloadError, match="text/html, not a FIT file"):
        asyncio.run(sync.fetch_fit("https://s3.coros.com/fit/1/2.fit"))
