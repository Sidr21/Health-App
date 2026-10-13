"""DB glue for strain, load, stress, energy, fitness models, bio age (fixtures + synthetic FIT)."""

from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from health import db as dbmod
from tests.fitwriter import synthetic_run

pytestmark = pytest.mark.usefixtures("tmp_db")
H = {"Authorization": "Bearer testtoken"}
D = date(2026, 10, 13)
RUN = "100000000000000001"


def _load(fixture_text, with_fit=True):
    from health.models import Activity
    from health.sources.coros.store import import_text
    from health.sources.fit import store_fit

    kinds = [
        ("querySportRecords", "sport_records.txt"),
        ("queryRestingHeartRate", "resting_hr.txt"),
        ("queryDailyHealthData", "daily_health.txt"),
        ("querySleepOverview", "sleep_overview.txt"),
        ("querySleepHrv", "sleep_hrv.txt"),
        ("queryStressTimeSeries", "stress_series.txt"),
        ("queryFitnessAssessmentOverview", "fitness.txt"),
        ("queryUserInfo", "user_info.txt"),
    ]
    with dbmod.session_scope() as s:
        for kind, name in kinds:
            import_text(s, kind, fixture_text(name))
        import_text(s, "getActivityDetail", fixture_text("activity_detail.txt"), label_id=RUN)
        import_text(
            s,
            "queryActivityLapData",
            Path("tests/fixtures/coros/lap_data.json").read_text(),
            label_id=RUN,
        )
        if with_fit:
            act = s.execute(select(Activity).where(Activity.external_id == RUN)).scalar_one()
            store_fit(s, act, synthetic_run(act.start_ts, minutes=36, cooldown_s=120, running=True))


def test_compute_range_stores_strain_load_stress_energy(fixture_text):
    from health.compute import compute_range
    from health.models import Score

    _load(fixture_text)
    with dbmod.session_scope() as s:
        compute_range(s, date(2026, 10, 9), D)
        scores = {(r.date, r.kind): r for r in s.execute(select(Score)).scalars()}
    strain = scores[(date(2026, 10, 12), "strain")]
    run = strain.components["workouts"][0]
    assert run["method"] == "stream" and run["trimp"] > 30
    assert strain.value == pytest.approx(
        21 * (1 - 2.718281828 ** (-strain.components["trimp"] / 150)), abs=0.1
    )
    assert strain.components["step_trimp"] >= 0 and strain.components["band"]
    rest = scores[(date(2026, 10, 10), "strain")]
    assert rest.value < strain.value
    load = scores[(D, "cardio_load")]
    assert load.components["status"] == "Building baseline"  # only days of history
    assert set(load.components) >= {"ctl", "atl", "tsb", "optimal", "week_trimp"}
    assert (D, "stress") in scores or (date(2026, 10, 12), "stress") in scores
    energy = [v for (d, k), v in scores.items() if k == "energy"]
    assert energy and all(0 <= e.value <= 100 for e in energy)
    assert all(e.components["timeline"] for e in energy)


def test_fitness_models_from_streams(fixture_text):
    from health.compute_models import compute_fitness, latest_fitness

    _load(fixture_text)
    with dbmod.session_scope() as s:
        r = compute_fitness(s, D)
        latest = latest_fitness(s, D)
    assert r["runs_with_streams"] == 1 and r["hr_max"]
    assert r["vo2max"] and 25 < r["vo2max"] < 80
    assert ("vo2max", "hr_pace") in latest and ("vo2max", "blend") in latest
    assert latest[("vo2max", "coros")].value == 56  # COROS's value kept alongside ours
    assert ("lthr", "prior") in latest and latest[("lthr", "blend")].value > 100
    assert ("race_5k", "ours") in latest and latest[("race_5k", "ours")].value > 600
    assert latest[("race_m", "ours")].value > latest[("race_hm", "ours")].value * 2


def test_fitness_models_without_streams_keep_coros_only(fixture_text):
    from health.compute_models import compute_fitness, latest_fitness

    _load(fixture_text, with_fit=False)
    with dbmod.session_scope() as s:
        r = compute_fitness(s, D)
        latest = latest_fitness(s, D)
    assert r["runs_with_streams"] == 0 and r.get("vo2max") is None
    assert ("vo2max", "blend") not in latest and ("race_5k", "ours") not in latest


def test_bio_age_and_api(fixture_text):
    from health.api.main import app
    from health.compute import compute_range

    _load(fixture_text)
    with dbmod.session_scope() as s:
        compute_range(s, date(2026, 10, 9), D)
    c = TestClient(app)
    b = c.get("/bioage", headers=H).json()
    assert b["value"] is not None and b["age"] == pytest.approx(26.7, abs=0.2)
    assert sum(b["contributions"].values()) == pytest.approx(b["delta"], abs=0.1)
    assert b["inputs"]["vo2max"] is not None
    m = c.get("/fitness/models", headers=H).json()
    assert m["vo2max"]["ours"]["value"] and m["vo2max"]["coros"]["value"] == 56
    assert m["vo2max"]["parts"]["hr_pace"]
    assert any(r["ours_s"] for r in m["races"]) and m["lthr"]["value"]
    day = c.get("/days", params={"start": "2026-10-12", "end": "2026-10-12"}, headers=H).json()[0]
    assert day["scores"]["strain"]["value"] > 0 and "cardio_load" in day["scores"]
