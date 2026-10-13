import math
from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from health import db as dbmod
from health.config import settings

pytestmark = pytest.mark.usefixtures("tmp_db")


def _import_all(fixture_text):
    from health.sources.coros.store import import_text

    kinds = [
        ("querySportRecords", "sport_records.txt"),
        ("queryRestingHeartRate", "resting_hr.txt"),
        ("queryDailyHealthData", "daily_health.txt"),
        ("querySleepOverview", "sleep_overview.txt"),
        ("querySleepHrv", "sleep_hrv.txt"),
        ("queryStressLevel", "stress_level.txt"),
        ("queryStressTimeSeries", "stress_series.txt"),
        ("queryTrainingLoadAssessment", "training_load.txt"),
        ("queryRecoveryStatus", "recovery.txt"),
        ("queryFitnessAssessmentOverview", "fitness.txt"),
        ("queryUserInfo", "user_info.txt"),
    ]
    lid = "100000000000000001"
    with dbmod.session_scope() as s:
        for kind, name in kinds:
            import_text(s, kind, fixture_text(name))
        import_text(
            s,
            "getActivityDetail",
            fixture_text("activity_detail.txt"),
            label_id=lid,
        )
        from pathlib import Path

        import_text(
            s,
            "queryActivityLapData",
            Path("tests/fixtures/coros/lap_data.json").read_text(),
            label_id=lid,
        )


def test_import_is_idempotent(fixture_text):
    from sqlalchemy import select

    from health.models import Activity, ActivityLap, Daily, HrvSample, SleepSession

    _import_all(fixture_text)
    _import_all(fixture_text)
    with dbmod.session_scope() as s:
        acts = s.execute(select(Activity)).scalars().all()
        assert len(acts) == 4
        run = next(a for a in a_list(acts) if a.external_id == "100000000000000001")
        assert run.coros_training_load == 86 and run.max_hr == 178 and run.avg_power_w == 184
        assert len(s.execute(select(ActivityLap)).scalars().all()) == 2
        assert len(s.execute(select(HrvSample)).scalars().all()) == 8
        d = s.get(Daily, date(2026, 10, 13))
        assert (
            d.rhr == 57
            and d.steps == 1100
            and d.coros_stl == 29
            and d.coros_recovery_pct in (100, None)
        )
        sl = s.execute(
            select(SleepSession).where(SleepSession.date == date(2026, 10, 13))
        ).scalar_one()
        assert sl.asleep_s == 7 * 3600 + 7 * 60 and sl.deep_s == 92 * 60 and sl.hr_min == 50
        assert sl.start_ts == datetime(2026, 10, 12, 23, 51)
    assert (settings.raw_dir / "coros" / "querySportRecords").exists()


def a_list(x):
    return list(x)


def _seed_history(days=30):
    """Synthetic month of nights so baselines exist, then one low-HRV night at the end."""
    from health.models import Daily, HrvSample, SleepSession

    today = date(2026, 10, 13)
    with dbmod.session_scope() as s:
        for k in range(days, -1, -1):
            d = today - timedelta(days=k)
            last = k == 0
            s.merge(Daily(date=d, rhr=66 if last else 56 + (k % 3)))
            start = datetime.combine(d - timedelta(days=1), datetime.min.time()).replace(hour=23)
            end = datetime.combine(d, datetime.min.time()).replace(hour=7)
            s.add(
                SleepSession(
                    date=d,
                    start_ts=start,
                    end_ts=end,
                    asleep_s=int(7.5 * 3600),
                    in_bed_s=8 * 3600,
                    deep_s=80 * 60,
                    light_s=4 * 3600,
                    rem_s=100 * 60,
                    awake_s=20 * 60,
                    awake_count=1,
                    hr_avg=52,
                    hr_min=45,
                )
            )
            base = 30.0 if last else 45.0 + (k % 5)
            for j in range(40):
                ts = start + timedelta(minutes=10 * j)
                s.add(
                    HrvSample(
                        ts=ts, date=d, rmssd_ms=base + (j % 4), confidence=100000, context="sleep"
                    )
                )
    return today


def test_compute_recovery_and_api():
    from health.compute import compute_day

    today = _seed_history()
    with dbmod.session_scope() as s:
        out = compute_day(s, today)
        assert out["sleep"] is not None and out["sleep"] > 70
        assert out["recovery"] is not None and out["recovery"] < 34  # low HRV + high RHR -> red
        assert math.isclose(out["hrv_ms"], 31.5, abs_tol=1.0)
        good = compute_day(s, today - timedelta(days=1))
        assert good["recovery"] > 55

    from health.api.main import app

    client = TestClient(app)
    assert client.get("/health").json()["ok"] is True
    assert client.get("/today").status_code == 401
    h = {"Authorization": "Bearer testtoken"}
    r = client.get(
        "/days", params={"start": str(today - timedelta(days=1)), "end": str(today)}, headers=h
    )
    assert r.status_code == 200
    payload = r.json()
    assert payload[-1]["scores"]["recovery"]["components"]["band"] == "red"
    assert payload[-1]["sleep"]["asleep_s"] == int(7.5 * 3600)


def test_apple_health_ingest():
    from health.api.main import app

    client = TestClient(app)
    h = {"Authorization": "Bearer testtoken"}
    body = {
        "samples": [
            {
                "type": "HKQuantityTypeIdentifierBodyMass",
                "uuid": "u1",
                "start": "2026-10-13T07:00:00Z",
                "value": 148.6,
                "unit": "lb",
                "source": "com.example.scale",
            },
            {
                "type": "HKQuantityTypeIdentifierBodyFatPercentage",
                "uuid": "u2",
                "start": "2026-10-13T07:00:00Z",
                "value": 0.152,
                "unit": "%",
                "source": "com.example.scale",
            },
            {
                "type": "HKQuantityTypeIdentifierStepCount",
                "uuid": "u3",
                "start": "2026-10-13T07:00:00Z",
                "value": 100,
                "unit": "count",
                "source": "x",
            },
        ]
    }
    r = client.post("/ingest/apple-health", json=body, headers=h)
    assert r.status_code == 200 and r.json() == {"stored": 2, "skipped": 0, "unknown_type": 1}
    r = client.post("/ingest/apple-health", json=body, headers=h)
    assert r.json()["skipped"] == 2
    rows = client.get("/body", params={"metric": "weight_kg"}, headers=h).json()
    assert len(rows) == 1 and abs(rows[0]["value"] - 67.4) < 0.1
    fat = client.get("/body", params={"metric": "body_fat_pct"}, headers=h).json()
    assert abs(fat[0]["value"] - 15.2) < 0.01


def test_day_bounds_utc_uses_local_day():
    from datetime import datetime

    from health.api.main import day_bounds_utc

    lo, hi = day_bounds_utc(date(2026, 10, 13), "America/New_York")
    assert lo == datetime(2026, 10, 13, 4, 0) and hi == datetime(2026, 10, 14, 4, 0)
