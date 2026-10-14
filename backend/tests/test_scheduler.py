"""Background sync: windows, single flight, failure handling, token seeding, API."""

import asyncio
import json
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from health import scheduler
from health.config import settings

pytestmark = pytest.mark.usefixtures("tmp_db")
H = {"Authorization": "Bearer testtoken"}


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch):
    monkeypatch.setattr(scheduler, "state", scheduler.SyncState())


def _authorize():
    p = settings.coros_token_path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps({"tokens": {"access_token": "x", "token_type": "Bearer"}}))


def test_window_quick_then_one_deep_sync_per_day():
    morning = datetime(2026, 10, 13, 2, 0)
    after = datetime(2026, 10, 13, 5, 0)
    assert scheduler.window_for(morning, None) == settings.sync_days  # before the deep hour
    assert scheduler.window_for(after, None) == settings.sync_full_days
    assert scheduler.window_for(after, after.date()) == settings.sync_days  # done today


def test_run_once_records_outcome_and_needs_auth():
    async def fake(days, fit_limit):
        return {"querySleepHrv": 2, "queryStressLevel": -1}

    st = asyncio.run(scheduler.run_once(3, sync=fake))
    assert st.last_ok is False and "no COROS login" in st.last_error  # no token yet
    _authorize()
    st = asyncio.run(scheduler.run_once(3, sync=fake))
    assert st.last_ok is False and st.last_error == "tools failed: queryStressLevel"
    assert st.last_counts["querySleepHrv"] == 2 and not st.running and st.last_days == 3


def test_deep_run_marks_the_day_and_errors_are_contained():
    _authorize()

    async def boom(days, fit_limit):
        raise RuntimeError("COROS down")

    st = asyncio.run(scheduler.run_once(3, sync=boom))
    assert st.last_ok is False and st.last_error == "COROS down" and not st.running

    async def ok(days, fit_limit):
        assert fit_limit == settings.sync_fit_limit
        return {"x": 1}

    st = asyncio.run(scheduler.run_once(settings.sync_full_days, sync=ok))
    assert st.last_ok is True and st.last_full_date is not None


def test_runs_never_overlap():
    _authorize()
    calls = []

    async def slow(days, fit_limit):
        calls.append(days)
        await asyncio.sleep(0.05)
        return {}

    async def both():
        a = asyncio.create_task(scheduler.run_once(3, sync=slow))
        await asyncio.sleep(0)
        b = await scheduler.run_once(5, sync=slow)  # returns at once: one is running
        assert b.running
        await a

    asyncio.run(both())
    assert calls == [3]


def test_seed_token_only_when_missing(monkeypatch):
    blob = json.dumps({"tokens": {"access_token": "a", "token_type": "Bearer"}, "client": {}})
    monkeypatch.setattr(settings, "coros_token_json", blob)
    assert scheduler.seed_coros_token() is True
    assert scheduler.coros_authorized()
    assert oct(settings.coros_token_path.stat().st_mode)[-3:] == "600"
    monkeypatch.setattr(settings, "coros_token_json", json.dumps({"tokens": {"x": 1}}))
    assert scheduler.seed_coros_token() is False  # the file (with refreshes) wins
    settings.coros_token_path.unlink()
    monkeypatch.setattr(settings, "coros_token_json", '{"access_token": "only"}')
    with pytest.raises(ValueError):
        scheduler.seed_coros_token()


def test_sync_endpoints(monkeypatch):
    from health.api.main import app

    async def fake(days, fit_limit):
        return {"ok": 1}

    monkeypatch.setattr(scheduler, "_coros_sync", fake)
    _authorize()
    c = TestClient(app)
    assert c.get("/sync/state").status_code == 401
    st = c.get("/sync/state", headers=H).json()
    assert st["enabled"] is False and st["coros_auth"] is True and st["last_ok"] is None
    c.post("/sync", headers=H)
    st = c.get("/sync/state", headers=H).json()
    assert st["last_ok"] is True and st["last_counts"] == {"ok": 1}
    assert c.post("/sync?days=500", headers=H).status_code == 422
