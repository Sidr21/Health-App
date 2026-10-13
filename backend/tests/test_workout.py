from datetime import date, datetime

import pytest
from sqlalchemy import select

from health import db as dbmod
from health.engine.workout import (
    cardio_focus,
    estimate_hr_max,
    hr_recovery,
    time_in_zones_laps,
    time_in_zones_stream,
    zone_of,
    zones,
)
from health.sources.fit import parse_fit
from tests.fitwriter import synthetic_run, write_fit

START = datetime(2026, 10, 1, 12, 0)


def test_hr_max_estimate_prefers_set_value_then_higher_candidate():
    hm = estimate_hr_max(date(2000, 1, 1), date(2026, 1, 1), [150, 178, 240])
    assert hm.candidates == {"age_formula": 190, "observed": 178}  # 240 is a glitch, ignored
    assert hm.value == 190 and hm.method == "age_formula"
    hm = estimate_hr_max(date(2000, 1, 1), date(2026, 1, 1), [195])
    assert hm.method == "observed" and hm.value == 195
    hm = estimate_hr_max(None, date(2026, 1, 1), [], set_value=188, set_source="field_test")
    assert hm.value == 188 and hm.method == "field_test"
    assert estimate_hr_max(None, date(2026, 1, 1), []) is None


def test_zones_and_time_in_zone():
    z = zones(200)
    assert [x["lo_bpm"] for x in z] == [None, 120, 140, 160, 180]
    assert z[1]["hi_bpm"] == 139 and z[4]["hi_bpm"] is None
    assert [zone_of(h, 200) for h in (100, 120, 150, 165, 199)] == [1, 2, 3, 4, 5]
    stream = [(t, 130 if t < 60 else 170) for t in range(0, 120)]
    secs = time_in_zones_stream(stream, 200)
    assert secs[1] == 60 and secs[3] == 59  # last sample owns no time
    gap = time_in_zones_stream([(0, 130), (100, 130)], 200)
    assert gap[1] == 10  # gaps capped at 10 s
    assert time_in_zones_laps([(600, 130), (300, 185), (None, 150)], 200) == [0, 600, 0, 0, 300]


def test_cardio_focus():
    assert cardio_focus([100, 100, 100, 100, 100]) == {
        "low_aerobic": 40.0,
        "high_aerobic": 40.0,
        "anaerobic": 20.0,
    }
    assert cardio_focus([0] * 5) is None


def test_fit_round_trip_and_hr_recovery():
    parsed = parse_fit(synthetic_run(START, minutes=10, cooldown_s=120))
    assert parsed.start == START and len(parsed.samples) == 720
    s0 = parsed.samples[0]
    assert s0["hr"] == 120 and s0["speed_mps"] == pytest.approx(2.8)
    assert s0["alt_m"] == pytest.approx(10) and s0["cadence"] == 82
    stream = [(x["t_offset_s"], x["hr"]) for x in parsed.samples]
    hrr = hr_recovery(stream, 190)
    # HR plateaus at 175 just before the finish, so the drop can start a few seconds early
    assert hrr is not None and 590 <= hrr["at_s"] <= 600
    assert hrr["from_bpm"] == 175 and 32 <= hrr["drop_bpm"] < 40 and hrr["rating"] == "Good"
    # no cool-down recorded -> no HRR
    flat = parse_fit(synthetic_run(START, minutes=10, cooldown_s=0))
    assert hr_recovery([(x["t_offset_s"], x["hr"]) for x in flat.samples], 190) is None


def test_fit_missing_hr_is_none():
    blob = write_fit(START, [{"t": 0, "hr": 255}, {"t": 1, "hr": 140}])
    assert [x["hr"] for x in parse_fit(blob).samples] == [None, 140]


@pytest.mark.usefixtures("tmp_db")
def test_workout_detail_endpoint_laps_then_stream(fixture_text):
    from pathlib import Path

    from fastapi.testclient import TestClient

    from health.api.main import app
    from health.models import Activity
    from health.sources.coros.store import import_text
    from health.sources.fit import store_fit

    lid = "100000000000000001"
    with dbmod.session_scope() as s:
        import_text(s, "querySportRecords", fixture_text("sport_records.txt"))
        import_text(s, "queryUserInfo", fixture_text("user_info.txt"))
        import_text(s, "getActivityDetail", fixture_text("activity_detail.txt"), label_id=lid)
        import_text(
            s,
            "queryActivityLapData",
            Path("tests/fixtures/coros/lap_data.json").read_text(),
            label_id=lid,
        )
        aid = s.execute(select(Activity.id).where(Activity.external_id == lid)).scalar_one()
    c = TestClient(app)
    h = {"Authorization": "Bearer testtoken"}
    assert c.get(f"/activities/{aid}").status_code == 401
    assert c.get("/activities/99999", headers=h).status_code == 404
    j = c.get(f"/activities/{aid}", headers=h).json()
    assert j["stats"]["total_s"] == 41 * 60 + 45 and j["coros"]["training_focus"] == "Base"
    assert j["hr_max"]["method"] in ("age_formula", "observed")
    assert j["zones"]["method"] == "laps" and j["hr_recovery"] is None
    assert j["stream"]["n"] == 0 and len(j["laps"]) == 2
    assert j["muscles"][0]["id"] == "quads"

    with dbmod.session_scope() as s:
        act = s.get(Activity, aid)
        store_fit(s, act, synthetic_run(act.start_ts, minutes=10, cooldown_s=120))
    j = c.get(f"/activities/{aid}", headers=h).json()
    assert j["zones"]["method"] == "stream" and j["hr_recovery"]["drop_bpm"] > 20
    assert j["stream"]["n"] == 720 and len(j["stream"]["points"]) == 300
    assert sum(z["seconds"] for z in j["zones"]["zones"]) == pytest.approx(719, abs=2)


def test_running_cadence_doubled_and_laps_parsed():
    parsed = parse_fit(synthetic_run(START, minutes=10, cooldown_s=0, running=True))
    assert parsed.sport == "running"
    assert parsed.samples[0]["cadence"] == 164  # 82 strides/min per leg -> steps/min
    assert [lap["avg_hr"] for lap in parsed.laps] == [140, 165]
    assert parsed.laps[1]["avg_cadence"] == 168 and parsed.laps[0]["timer_s"] == 300


def test_hr_recovery_ignores_drops_across_a_pause():
    paused = parse_fit(synthetic_run(START, minutes=10, cooldown_s=120, pause_at=600))
    stream = [(x["t_offset_s"], x["hr"]) for x in paused.samples]
    assert hr_recovery(stream, 190) is None


@pytest.mark.usefixtures("tmp_db")
def test_store_fit_adds_laps_and_session_when_coros_has_none(fixture_text):
    from health.models import Activity, ActivityLap
    from health.sources.coros.store import import_text
    from health.sources.fit import store_fit

    with dbmod.session_scope() as s:
        import_text(s, "querySportRecords", fixture_text("sport_records.txt"))
        act = s.execute(
            select(Activity).where(Activity.external_id == "100000000000000003")
        ).scalar_one()
        store_fit(s, act, synthetic_run(act.start_ts, minutes=10, running=True))
        laps = (
            s.execute(select(ActivityLap).where(ActivityLap.activity_id == act.id)).scalars().all()
        )
        assert [lap.idx for lap in laps] == [1, 2] and laps[1].avg_cadence == 168
        assert laps[0].avg_pace_s_per_km == pytest.approx(300, abs=1)
        assert act.raw_json["fit_session"]["sport"] == "running"


def test_hr_recovery_needs_easing_off_when_speed_is_known():
    parsed = parse_fit(synthetic_run(START, minutes=10, cooldown_s=120))
    with_speed = [(x["t_offset_s"], x["hr"], x["speed_mps"]) for x in parsed.samples]
    assert hr_recovery(with_speed, 190)["drop_bpm"] >= 32  # walked after: counts
    # same HR curve but still running at effort pace: not a recovery
    no_ease = [(t, hr, 3.3) for t, hr, _ in with_speed]
    assert hr_recovery(no_ease, 190) is None
