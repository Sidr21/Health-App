from datetime import date, datetime

from health.sources.coros import parsers as p


def test_sport_records(fixture_text):
    recs = p.parse_sport_records(fixture_text("sport_records.txt"))
    assert [r.sport_type for r in recs] == [100, 201, 104, 402]
    run = recs[0]
    assert run.label_id == "100000000000000001"
    assert run.date == date(2026, 10, 12)
    assert run.duration_s == 37 * 60 + 18
    assert run.distance_m == 6040
    assert run.avg_pace_s_per_km == 370
    assert run.avg_hr == 155 and run.calories == 502
    assert run.start_ts == 1791848629 and run.end_ts == 1791851134
    assert run.lat == 40.700001
    bike = recs[1]
    assert bike.duration_s == 84 * 60 + 33 and bike.distance_m is None and bike.avg_hr == 74
    hike = recs[2]
    assert hike.avg_speed_kmh == 1.6 and hike.distance_m == 2900
    strength = recs[3]
    assert strength.sets == 3 and strength.duration_s == 347


def test_resting_hr(fixture_text):
    vals = p.parse_dated_values(fixture_text("resting_hr.txt"))
    assert vals[date(2026, 10, 13)] == 57
    assert vals[date(2026, 10, 10)] is None
    assert len(vals) == 5


def test_daily_health(fixture_text):
    rep = p.parse_daily_health(fixture_text("daily_health.txt"))
    assert rep.rhr == 52 and rep.hrv_baseline == 42
    d0, d1 = rep.days
    assert d0.date == date(2026, 10, 12) and d0.steps == 9335 and d0.exercise_min == 39
    assert d0.sleep_total_s == 8 * 3600 + 58 * 60
    assert d0.sleep_awake_s == 15 * 60 and d0.sleep_hr_min == 34
    assert d1.exercise_min == 65 and d1.sleep_awake_s == 69 * 60 and d1.stress_avg == 22


def test_sleep_overview(fixture_text):
    nights = p.parse_sleep_overview(fixture_text("sleep_overview.txt"))
    assert len(nights) == 2
    n = nights[1]
    assert n.date == date(2026, 10, 13) and n.score == 68
    assert n.main_asleep_s == 7 * 3600 + 7 * 60 and n.main_period_s == 8 * 3600 + 16 * 60
    assert n.deep_pct == 19 and n.rem_pct == 12 and n.awake_count == 4
    assert n.window_start == datetime(2026, 10, 12, 23, 51)
    assert n.window_end == datetime(2026, 10, 13, 8, 7)


def test_sleep_hrv(fixture_text):
    rep = p.parse_sleep_hrv(fixture_text("sleep_hrv.txt"))
    assert [a.date for a in rep.assessments] == [date(2026, 10, 13), date(2026, 10, 12)]
    a = rep.assessments[0]
    assert (a.avg_ms, a.status, a.normal_low, a.normal_high, a.baseline) == (
        42,
        "Normal",
        36,
        58,
        47,
    )
    assert len(rep.points) == 8
    pt = rep.points[1]
    assert pt.date == date(2026, 10, 12) and pt.hrv_ms == 92 and pt.confidence == 88888


def test_stress(fixture_text):
    days = p.parse_stress_level(fixture_text("stress_level.txt"))
    assert (days[0].date, days[0].avg, days[0].label) == (date(2026, 10, 13), 22, "Relaxed")
    pts = p.parse_stress_series(fixture_text("stress_series.txt"))
    assert len(pts) == 3 and pts[-1].stress == 82 and pts[-1].score == 4


def test_training_load(fixture_text):
    days = p.parse_training_load(fixture_text("training_load.txt"))
    assert days[0].date == date(2026, 10, 13)
    assert (days[0].comment, days[0].stl, days[0].ltl, days[0].ratio) == (
        "Performance",
        29,
        46,
        0.63,
    )


def test_singletons(fixture_text):
    rec = p.parse_recovery_status(fixture_text("recovery.txt"))
    assert rec == {"recovery_pct": 100, "level": "Heavy training allowed", "full_recovery_s": 0}
    fit = p.parse_fitness_assessment(fixture_text("fitness.txt"))
    assert fit["vo2max"] == 56 and fit["threshold_pace_s_per_km"] == 283
    assert fit["pred_half_s"] == 1 * 3600 + 45 * 60 + 23
    assert fit["pred_marathon_s"] == 3 * 3600 + 42 * 60 + 13  # not the half's line
    user = p.parse_user_info(fixture_text("user_info.txt"))
    assert user["height_cm"] == 175.0 and user["dob"] == date(2000, 1, 15) and user["sex"] == "male"
    det = p.parse_activity_detail(fixture_text("activity_detail.txt"))
    assert det["training_load"] == 86 and det["aerobic_te"] == 2.7 and det["elev_gain_m"] == 15
    assert det["elev_loss_m"] == 24 and det["total_time_s"] == 41 * 60 + 45
    assert det["workout_time_s"] == 37 * 60 + 18 and det["stride_m"] == 1.09


def test_lap_data():
    from pathlib import Path

    laps = p.parse_lap_data(Path("tests/fixtures/coros/lap_data.json").read_text())
    assert len(laps) == 3
    assert laps[0]["group_type"] == 2 and laps[0]["avgHr"] == 132
    assert laps[2]["group_type"] == -1 and laps[2]["distance"] == 604326
