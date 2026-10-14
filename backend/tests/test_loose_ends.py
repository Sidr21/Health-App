"""Status chip, day vitals, HR recovery summary, SpO2 percentages."""

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from health import db as dbmod
from health.api.main import app
from health.models import BodyMetric, JournalEntry

pytestmark = pytest.mark.usefixtures("tmp_db")
H = {"Authorization": "Bearer testtoken"}
D = date(2026, 10, 13)  # pinned "today" (conftest)


def _tags():
    with dbmod.session_scope() as s:
        return {(r.date, r.tag) for r in s.execute(select(JournalEntry)).scalars()}


def test_status_until_changed_logs_each_day(monkeypatch):
    from health import config

    c = TestClient(app)
    assert c.get("/status", headers=H).json() == {"status": "active", "since": None}
    r = c.put("/status", json={"status": "sick"}, headers=H).json()
    assert r == {"status": "sick", "since": "2026-10-13"}
    assert (D, "sick") in _tags()
    # two days later the status still holds and both missing days get logged
    monkeypatch.setattr(config.settings, "today", date(2026, 10, 15))
    assert c.get("/status", headers=H).json()["status"] == "sick"
    assert {(date(2026, 10, 14), "sick"), (date(2026, 10, 15), "sick")} <= _tags()
    # switching changes today's tag only; back to active stops it
    c.put("/status", json={"status": "travel"}, headers=H)
    tags = _tags()
    assert (date(2026, 10, 15), "travel") in tags and (date(2026, 10, 15), "sick") not in tags
    c.put("/status", json={"status": "active"}, headers=H)
    assert not {t for t in _tags() if t[0] == date(2026, 10, 15)}
    monkeypatch.setattr(config.settings, "today", date(2026, 10, 16))
    assert c.get("/status", headers=H).json()["status"] == "active"
    assert not {t for t in _tags() if t[0] == date(2026, 10, 16)}
    day = c.get("/days", params={"start": "2026-10-14", "end": "2026-10-14"}, headers=H).json()[0]
    assert day["status"] == "sick"
    assert c.put("/status", json={"status": "napping"}, headers=H).status_code == 422


def test_day_vitals_and_spo2_percent():
    from health.sources.apple_health import HKPayload, ingest

    payload = HKPayload.model_validate(
        {
            "samples": [
                {
                    "type": "HKQuantityTypeIdentifierOxygenSaturation",
                    "uuid": "a",
                    "value": 0.97,
                    "unit": "%",
                    "start": "2026-10-13T08:00:00Z",
                    "source": "watch",
                },
                {
                    "type": "HKQuantityTypeIdentifierRespiratoryRate",
                    "uuid": "b",
                    "value": 14.0,
                    "unit": "count/min",
                    "start": "2026-10-13T08:00:00Z",
                    "source": "watch",
                },
            ]
        }
    )
    with dbmod.session_scope() as s:
        ingest(s, payload)
        spo2 = s.execute(select(BodyMetric).where(BodyMetric.metric == "spo2_pct")).scalar_one()
        assert spo2.value == pytest.approx(97)
    day = (
        TestClient(app)
        .get("/days", params={"start": "2026-10-13", "end": "2026-10-13"}, headers=H)
        .json()[0]
    )
    assert day["vitals"] == {"spo2_pct": 97.0, "resp_rate": 14.0}


def test_hr_recovery_summary(fixture_text):
    from pathlib import Path

    from health.models import Activity
    from health.sources.coros.store import import_text
    from health.sources.fit import store_fit
    from tests.fitwriter import synthetic_run

    with dbmod.session_scope() as s:
        import_text(s, "queryUserInfo", fixture_text("user_info.txt"))
        import_text(s, "querySportRecords", fixture_text("sport_records.txt"))
        lid = s.execute(select(Activity.external_id)).scalars().first()
        import_text(s, "getActivityDetail", fixture_text("activity_detail.txt"), label_id=lid)
        import_text(
            s,
            "queryActivityLapData",
            Path("tests/fixtures/coros/lap_data.json").read_text(),
            label_id=lid,
        )
        act = s.execute(select(Activity).where(Activity.external_id == lid)).scalar_one()
        store_fit(s, act, synthetic_run(act.start_ts, minutes=10, cooldown_s=120))
    m = TestClient(app).get("/fitness/models", headers=H).json()
    hrr = m["hr_recovery"]
    assert hrr["latest"]["drop_bpm"] > 20 and hrr["latest"]["rating"]
    assert hrr["best"]["activity_id"] == hrr["latest"]["activity_id"] and hrr["checked"] == 1
