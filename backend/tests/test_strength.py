import json
from datetime import date, datetime
from pathlib import Path

import pytest
from sqlalchemy import select

from health import db as dbmod
from health.sources.coros.parsers import parse_lap_data, parse_strength_laps
from health.sources.strength_csv import LB, detect, parse_csv, parse_hevy, parse_strong

FIX = Path(__file__).parent / "fixtures"
NY = "America/New_York"


def _read(*parts: str) -> str:
    return FIX.joinpath(*parts).read_text()


# ---------------------------------------------------------------- COROS strength laps


def test_coros_strength_laps_sets_loads_and_bodyweight():
    laps = parse_lap_data(_read("coros", "strength_lap_data.json"))
    sets = parse_strength_laps(laps)
    assert [(x.exercise, x.reps) for x in sets] == [
        ("Barbell Back Squat", 5),
        ("Barbell Back Squat", 5),
        ("Barbell Back Squat", 4),
        ("Push-Up", 15),
        ("Push-Up", 12),
    ]
    squat = sets[2]
    assert squat.weight_kg == 102.5 and not squat.is_bodyweight
    assert squat.offset_s == 322 and squat.avg_hr == 117 and squat.duration_s == 38
    # push-ups carry the rest laps' default weight (profile body weight): no lifted load
    assert all(x.is_bodyweight and x.weight_kg is None for x in sets[3:])


def test_coros_uniform_default_weight_and_missing_sets():
    """No load entered anywhere: every lap has the same weight. The summary says 3 sets but
    only two laps have reps, so a third set with unknown reps is added."""
    g = 68000
    laps = [
        {
            "exerciseNameKey": "Whole Body",
            "sets": 0,
            "reps": 3,
            "time": 47,
            "totalLength": 47,
            "weight": g,
        },
        {
            "exerciseNameKey": "Whole Body",
            "sets": 0,
            "reps": 0,
            "time": 195,
            "totalLength": 242,
            "weight": g,
        },
        {
            "exerciseNameKey": "Whole Body",
            "sets": 0,
            "reps": 8,
            "time": 86,
            "totalLength": 328,
            "weight": g,
        },
        {
            "exerciseNameKey": "Whole Body",
            "sets": 3,
            "reps": 11,
            "time": 134,
            "totalLength": 482,
            "weight": 11 * g,
        },
        {
            "exerciseNameKey": "Rest",
            "sets": 3,
            "reps": 0,
            "time": 213,
            "totalLength": 695,
            "weight": 11 * g,
        },
    ]
    sets = parse_strength_laps(laps)
    assert [x.reps for x in sets] == [3, 8, None]
    assert all(x.weight_kg is None for x in sets)
    assert sets[0].is_bodyweight and sets[1].is_bodyweight


def test_coros_body_weight_hint():
    laps = [
        {
            "exerciseNameKey": "Dip",
            "sets": 0,
            "reps": 10,
            "time": 30,
            "totalLength": 30,
            "weight": 70200,
        },
        {
            "exerciseNameKey": "Dip",
            "sets": 0,
            "reps": 8,
            "time": 30,
            "totalLength": 90,
            "weight": 90200,
        },
    ]
    sets = parse_strength_laps(laps, body_weight_kg=70.0)
    assert sets[0].is_bodyweight and sets[1].weight_kg == 90.2


# ---------------------------------------------------------------- CSV exports


def test_detect():
    assert detect(_read("strength", "strong_export.csv")) == "strong"
    assert detect(_read("strength", "strong_export_semicolon.csv")) == "strong"
    assert detect(_read("strength", "hevy_export.csv")) == "hevy"
    assert detect("a,b,c\n1,2,3") is None
    with pytest.raises(ValueError):
        parse_csv("a,b,c\n1,2,3")


def test_parse_strong_lb():
    sets = parse_strong(_read("strength", "strong_export.csv"), unit="lb", tz=NY)
    assert len(sets) == 11  # rest timer row skipped
    assert len({x.session_key for x in sets}) == 2
    warm, first = sets[0], sets[1]
    assert warm.set_type == "warmup" and first.set_type == "normal"
    assert first.weight_kg == pytest.approx(155 * LB, abs=0.01) and first.reps == 8
    assert first.rpe == 8 and first.workout_name == "Upper A"
    # 07:05 EDT -> 11:05 UTC, still Sep 28 locally
    assert first.ts == datetime(2026, 9, 28, 11, 5, 12) and first.day == date(2026, 9, 28)
    pull = next(x for x in sets if x.exercise == "Pull Up")
    assert pull.is_bodyweight and pull.weight_kg is None
    plank = next(x for x in sets if x.exercise == "Plank")
    assert plank.reps is None and plank.duration_s == 60 and not plank.is_bodyweight
    assert sets[-1].set_type == "dropset"
    assert [x.set_idx for x in sets if x.workout_name == "Lower A"] == [0, 1, 2, 3]


def test_parse_strong_semicolon_with_units():
    sets = parse_strong(_read("strength", "strong_export_semicolon.csv"), unit="lb", tz=NY)
    assert [x.weight_kg for x in sets] == [50, 50, 27.5]  # per-row kg unit wins over `unit`


def test_parse_hevy():
    sets = parse_hevy(_read("strength", "hevy_export.csv"), tz=NY)
    assert len(sets) == 6
    assert [x.set_type for x in sets] == [
        "warmup",
        "normal",
        "failure",
        "normal",
        "normal",
        "dropset",
    ]
    row = sets[1]
    assert row.weight_kg == pytest.approx(165 * LB, abs=0.01) and row.reps == 8 and row.rpe == 8
    assert row.ts == datetime(2026, 10, 3, 21, 10) and row.day == date(2026, 10, 3)
    assert row.workout_name == "Pull Day"


# ---------------------------------------------------------------- storage


@pytest.mark.usefixtures("tmp_db")
def test_coros_strength_stored_and_linked(fixture_text):
    from health.models import Activity, StrengthSet
    from health.sources.coros.store import import_text

    for _ in range(2):  # idempotent
        with dbmod.session_scope() as s:
            import_text(s, "querySportRecords", fixture_text("sport_records.txt"))
            import_text(
                s,
                "queryActivityLapData",
                _read("coros", "strength_lap_data.json"),
                label_id="100000000000000004",
            )
    with dbmod.session_scope() as s:
        act = s.execute(
            select(Activity).where(Activity.external_id == "100000000000000004")
        ).scalar_one()
        rows = s.execute(select(StrengthSet).order_by(StrengthSet.set_idx)).scalars().all()
        assert len(rows) == 5
        assert {r.activity_id for r in rows} == {act.id}
        assert rows[0].source == "coros" and rows[0].session_key == "100000000000000004"
        assert rows[0].ts == act.start_ts and rows[2].weight_kg == 102.5
        assert rows[2].avg_hr == 117


@pytest.mark.usefixtures("tmp_db")
def test_csv_import_replaces_sessions():
    from health.models import StrengthSet
    from health.sources.strength_store import replace_sessions

    text = _read("strength", "hevy_export.csv")
    for _ in range(2):
        with dbmod.session_scope() as s:
            src, sets = parse_csv(text, tz=NY)
            replace_sessions(s, src, sets)
    with dbmod.session_scope() as s:
        rows = s.execute(select(StrengthSet)).scalars().all()
        assert len(rows) == 6 and {r.source for r in rows} == {"hevy"}


def test_fixtures_are_synthetic():
    """Guard: the strength fixtures must stay synthetic (repo is public)."""
    data = json.loads(_read("coros", "strength_lap_data.json"))
    assert data["labelId"].startswith("1000000000000000")


# ---------------------------------------------------------------- API


H = {"Authorization": "Bearer testtoken"}


def _client():
    from fastapi.testclient import TestClient

    from health.api.main import app

    return TestClient(app)


@pytest.mark.usefixtures("tmp_db")
def test_api_log_session_summary_and_delete():
    c = _client()
    body = {
        "started_at": "2026-10-10T18:00:00",
        "name": "Push",
        "unit": "lb",
        "sets": [
            {"exercise": "Bench Press (Barbell)", "reps": 8, "weight": 185},
            {"exercise": "Bench Press (Barbell)", "reps": 8, "weight": 185},
            {"exercise": "Bench Press (Barbell)", "reps": 6, "weight": 185},
            {"exercise": "Bench Press (Barbell)", "reps": 10, "weight": 95, "set_type": "warmup"},
            {"exercise": "Push Up", "reps": 20},
        ],
    }
    assert c.post("/strength/sessions", json=body).status_code == 401
    r = c.post("/strength/sessions", json=body, headers=H)
    assert r.status_code == 200
    key = r.json()["session_key"]
    assert key.startswith("manual-") and r.json()["sets"] == 5

    r = c.get("/strength", params={"date": "2026-10-10"}, headers=H)
    assert r.status_code == 200
    j = r.json()
    m = {x["id"]: x for x in j["muscles"]}
    assert m["chest"]["status"] in ("fatigued", "depleted") and m["chest"]["freshness"] < 80
    assert m["quads"]["freshness"] == 100 and m["quads"]["status"] == "recovered"
    assert m["chest"]["sets_7d"] == 4  # 3 bench + 1 push-up; warm-up does not count
    assert j["totals"]["sets_7d"] == 4 and j["totals"]["sessions_7d"] == 1
    assert j["totals"]["volume_7d_kg"] == pytest.approx(22 * 185 * LB, abs=0.5)
    assert j["daily"][-1]["date"] == "2026-10-10" and len(j["daily"]) == 7
    sess = j["sessions"][0]
    assert sess["name"] == "Push" and sess["sets"] == 4
    bench = sess["exercises"][0]
    assert bench["sets"] == 3 and bench["best_weight_kg"] == pytest.approx(185 * LB, abs=0.01)
    assert j["method"]["name"] == "muscles_v1" and j["method"]["inputs"]["sets"] == 5
    assert j["load"]["status"] == "Building baseline"

    # two days later the chest has mostly recovered
    later = c.get("/strength", params={"date": "2026-10-12"}, headers=H).json()
    chest_later = next(x for x in later["muscles"] if x["id"] == "chest")
    assert chest_later["freshness"] > m["chest"]["freshness"]

    assert c.delete(f"/strength/sessions/{key}", headers=H).json() == {"deleted": 5}
    assert c.delete(f"/strength/sessions/{key}", headers=H).status_code == 404


@pytest.mark.usefixtures("tmp_db")
def test_api_csv_upload_and_exercises():
    c = _client()
    text = _read("strength", "strong_export.csv")
    r = c.post(
        "/import/strength-csv",
        params={"unit": "lb"},
        content=text,
        headers={**H, "Content-Type": "text/csv"},
    )
    assert r.status_code == 200 and r.json() == {"source": "strong", "sets": 11, "sessions": 2}
    bad = c.post(
        "/import/strength-csv", content="a,b\n1,2", headers={**H, "Content-Type": "text/csv"}
    )
    assert bad.status_code == 422
    ex = c.get("/strength/exercises", headers=H).json()
    assert len(ex["muscles"]) == 15 and any(e["name"] == "Squat" for e in ex["exercises"])


@pytest.mark.usefixtures("tmp_db")
def test_watch_copy_of_a_logged_session_is_not_double_counted(fixture_text):
    from health.compute import strength_summary
    from health.sources.coros.store import import_text

    with dbmod.session_scope() as s:
        import_text(s, "querySportRecords", fixture_text("sport_records.txt"))
        import_text(
            s,
            "queryActivityLapData",
            _read("coros", "strength_lap_data.json"),
            label_id="100000000000000004",
        )
    d = date(2026, 9, 17)
    with dbmod.session_scope() as s:
        alone = strength_summary(s, d)
    assert alone["method"]["inputs"] == {"sets": 5, "activities": 0, "duplicates_dropped": 0}

    start = datetime.fromtimestamp(1789648595).astimezone()  # same workout, logged by hand
    r = _client().post(
        "/strength/sessions",
        json={
            "started_at": start.isoformat(),
            "unit": "kg",
            "sets": [{"exercise": "Squat", "reps": 5, "weight": 100}] * 3,
        },
        headers=H,
    )
    assert r.status_code == 200
    with dbmod.session_scope() as s:
        both = strength_summary(s, d)
    assert both["method"]["inputs"] == {"sets": 3, "activities": 0, "duplicates_dropped": 1}


@pytest.mark.usefixtures("tmp_db")
def test_compute_day_stores_muscular_score():
    from health.compute import compute_day
    from health.models import Score

    _client().post(
        "/strength/sessions",
        json={"started_at": "2026-10-10T18:00:00", "sets": [{"exercise": "Squat", "reps": 5}]},
        headers=H,
    )
    with dbmod.session_scope() as s:
        compute_day(s, date(2026, 10, 10))
        row = s.execute(select(Score).where(Score.kind == "muscular")).scalar_one()
        assert row.value > 0
        assert row.components["method"]["name"] == "muscles_v1"
        assert row.components["freshness"]["quads"] < 100


@pytest.mark.usefixtures("tmp_db")
def test_api_session_time_zones():
    c = _client()
    one = [{"exercise": "Squat", "reps": 5, "weight": 100}]
    # an aware UTC instant is stored as is; its local day comes from the user's time zone
    r = c.post(
        "/strength/sessions",
        json={"started_at": "2026-10-01T01:30:00Z", "unit": "kg", "sets": one},
        headers=H,
    )
    assert r.status_code == 200
    with dbmod.session_scope() as s:
        from health.models import StrengthSet

        row = s.execute(select(StrengthSet)).scalar_one()
        assert row.ts == datetime(2026, 10, 1, 1, 30) and row.date == date(2026, 9, 30)
    future = c.post(
        "/strength/sessions",
        json={"started_at": "2099-01-01T00:00:00Z", "unit": "kg", "sets": one},
        headers=H,
    )
    assert future.status_code == 422
