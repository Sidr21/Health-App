"""Endpoints behind the journal, insights, body, settings and fitness-model screens."""

from datetime import date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from health import db as dbmod
from health.engine.insights import tag_effects

pytestmark = pytest.mark.usefixtures("tmp_db")
H = {"Authorization": "Bearer testtoken"}


def _c():
    from health.api.main import app

    return TestClient(app)


def test_tag_effects_engine():
    d0 = date(2026, 6, 1)
    entries, outcomes = {}, {}
    for k in range(40):
        d = d0 + timedelta(days=k)
        alcohol = 1.0 if k % 2 else 0.0
        entries[d] = {"alcohol": alcohol, "caffeine": 100 + 10 * (k % 5)}
        # mornings after alcohol: ~12 points lower recovery, small noise
        outcomes[d + timedelta(days=1)] = {"recovery": 70 - 12 * alcohol + (k % 3), "rhr": 55}
    eff = {(e.tag, e.metric): e for e in tag_effects(entries, outcomes)}
    a = eff[("alcohol", "recovery")]
    assert a.strength == "clear" and a.diff < -10 and a.good is False and a.n_yes == 20
    assert eff[("alcohol", "rhr")].strength == "none"
    assert eff[("alcohol", "sleep")].strength == "need_more"
    c = eff[("caffeine", "recovery")]
    assert c.kind == "numeric" and c.split == "> 120 vs <= 120"
    few = tag_effects({d0: {"sugar": 1.0}}, {d0 + timedelta(days=1): {"recovery": 60}})
    assert all(e.strength == "need_more" for e in few)
    assert next(e for e in few if e.metric == "recovery").n_yes == 1


def test_journal_crud_and_insights():
    c = _c()
    r = c.put("/journal", json={"date": "2026-10-10", "tag": "alcohol", "value": 1}, headers=H)
    assert r.status_code == 200 and r.json()["value"] == 1
    c.put("/journal", json={"date": "2026-10-10", "tag": "alcohol", "value": 0}, headers=H)
    c.put("/journal", json={"date": "2026-10-11", "tag": "caffeine", "value": 180}, headers=H)
    assert (
        c.put("/journal", json={"date": "2026-10-11", "tag": "Bad Tag"}, headers=H).status_code
        == 422
    )
    rows = c.get("/journal", params={"start": "2026-10-01", "end": "2026-10-31"}, headers=H).json()
    assert rows == [
        {"date": "2026-10-10", "tag": "alcohol", "value": 0.0, "note": None},
        {"date": "2026-10-11", "tag": "caffeine", "value": 180.0, "note": None},
    ]
    assert c.delete("/journal/2026-10-10/alcohol", headers=H).json() == {"deleted": 1}
    ins = c.get("/journal/insights", headers=H).json()
    assert ins["outcomes"]["rhr"]["higher_is_better"] is False
    assert all(e["strength"] == "need_more" for e in ins["effects"])


def test_body_summary_computes_bmi_and_change():
    from health.models import BodyMetric, User

    today = date(2026, 10, 13)  # the pinned "today" (conftest)
    with dbmod.session_scope() as s:
        s.add(User(name="t", height_cm=180.0))
        for k, w in [(60, 80.0), (31, 79.0), (0, 78.0)]:
            ts = datetime.combine(today - timedelta(days=k), datetime.min.time()) + timedelta(
                hours=14
            )
            s.add(
                BodyMetric(
                    ts=ts,
                    source="apple:scale",
                    external_id=f"w{k}",
                    metric="weight_kg",
                    value=w,
                    unit="kg",
                )
            )
    j = _c().get("/body/summary", headers=H).json()
    w = j["metrics"]["weight_kg"]
    assert w["latest"]["value"] == 78.0 and w["change_30d"] == -1.0 and len(w["series"]) == 3
    bmi = j["metrics"]["bmi"]
    assert bmi["method"] == "weight/height^2" and bmi["latest"]["value"] == round(78 / 1.8**2, 1)
    assert j["metrics"]["body_fat_pct"]["latest"] is None


def test_settings_round_trip_and_hr_max_override(fixture_text):
    from health.sources.coros.store import import_text

    with dbmod.session_scope() as s:
        import_text(s, "queryUserInfo", fixture_text("user_info.txt"))
    c = _c()
    j = c.get("/settings", headers=H).json()
    assert j["profile"]["height_cm"] == 175 and j["hr_max"]["method"] == "age_formula"
    assert j["units"] == "imperial" and j["sleep_need_min"] == 480
    j = c.put(
        "/settings",
        json={
            "hr_max": 196,
            "hr_max_source": "field_test",
            "units": "metric",
            "sleep_need_min": 510,
        },
        headers=H,
    ).json()
    assert j["hr_max"]["effective"] == 196 and j["hr_max"]["method"] == "field_test"
    assert j["units"] == "metric" and j["sleep_need_min"] == 510
    j = c.put("/settings", json={"clear_hr_max": True}, headers=H).json()
    assert j["hr_max"]["method"] == "age_formula"
    assert c.put("/settings", json={"hr_max": 300}, headers=H).status_code == 422


def test_zones_follow_lthr_override_and_basis(fixture_text):
    from health.sources.coros.store import import_text

    with dbmod.session_scope() as s:
        import_text(s, "queryUserInfo", fixture_text("user_info.txt"))
        import_text(s, "queryFitnessAssessmentOverview", fixture_text("fitness.txt"))
    c = _c()
    z = c.get("/zones", headers=H).json()
    hm = z["hr_max"]
    assert z["basis"] == "lthr" and z["lthr_source"] == "prior"
    assert z["lthr"] == pytest.approx(0.89 * hm, abs=0.1)
    assert z["threshold_pace_source"] == "coros" and len(z["pace"]) == 5
    j = c.put("/settings", json={"lthr": 170}, headers=H).json()
    assert j["lthr"]["set_value"] == 170 and j["zones"]["lthr_source"] == "user"
    assert j["zones"]["hr"][4]["lo_bpm"] == 170
    j = c.put("/settings", json={"zone_basis": "hr_max"}, headers=H).json()
    assert j["zones"]["basis"] == "hr_max" and j["zones"]["hr"][4]["lo_bpm"] == round(0.9 * hm)
    j = c.put("/settings", json={"zone_basis": "lthr", "clear_lthr": True}, headers=H).json()
    assert j["zones"]["lthr_source"] == "prior"


def test_fitness_models_shows_coros_and_waits_for_streams(fixture_text):
    from health.sources.coros.store import import_text

    with dbmod.session_scope() as s:
        import_text(s, "queryFitnessAssessmentOverview", fixture_text("fitness.txt"))
        import_text(s, "querySportRecords", fixture_text("sport_records.txt"))
    j = _c().get("/fitness/models", headers=H).json()
    assert j["vo2max"]["coros"]["value"] == 56 and j["vo2max"]["ours"] is None
    assert "0 of 1 runs" in j["vo2max"]["status"]
    races = {r["key"]: r for r in j["races"]}
    assert races["race_m"]["coros_s"]["value"] == 3 * 3600 + 42 * 60 + 13
    assert j["running_level"]["value"] == 81


def test_add_missing_columns_migrates_old_table(tmp_path):
    from sqlalchemy import create_engine, inspect, text

    from health.db import add_missing_columns

    eng = create_engine(f"sqlite:///{tmp_path}/old.db")
    with eng.begin() as conn:
        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, name VARCHAR(80))"))
    added = add_missing_columns(eng)
    assert "users.sleep_need_min" in added and "users.hr_max" in added
    assert "sleep_need_min" in {c["name"] for c in inspect(eng).get_columns("users")}
    assert add_missing_columns(eng) == []
