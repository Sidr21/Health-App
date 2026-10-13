"""Strain / load, energy, fitness models and biological age engines."""

import math
from datetime import date, datetime, timedelta

import pytest

from health.engine import bioage, energy, fitness, load

# ---------------------------------------------------------------- load


def test_trimp_stream_matches_average_for_constant_hr():
    stream = [(t, 160) for t in range(0, 3601)]
    a = load.trimp_stream(stream, rhr=60, hr_max=190)
    b = load.trimp_average(3600, 160, rhr=60, hr_max=190)
    assert a == pytest.approx(b, rel=0.01)
    # 60 min at HRr 0.769 for a man: 60 * 0.769 * 0.64 * e^(1.92*0.769)
    assert b == pytest.approx(60 * (100 / 130) * 0.64 * math.exp(1.92 * 100 / 130), rel=1e-6)
    assert load.trimp_average(3600, 160, 60, 190, sex="female") != b


def test_workout_trimp_fallbacks():
    s = [(t, 150) for t in range(600)]
    assert (
        load.workout_trimp(
            stream=s, duration_s=600, avg_hr=150, coros_load=50, rhr=55, hr_max=190, sex="male"
        ).method
        == "stream"
    )
    assert (
        load.workout_trimp(
            stream=None, duration_s=600, avg_hr=150, coros_load=50, rhr=55, hr_max=190, sex="male"
        ).method
        == "avg_hr"
    )
    w = load.workout_trimp(
        stream=None, duration_s=600, avg_hr=None, coros_load=50, rhr=55, hr_max=190, sex="male"
    )
    assert w.method == "coros_load" and w.trimp == 50
    assert (
        load.workout_trimp(
            stream=None,
            duration_s=None,
            avg_hr=None,
            coros_load=None,
            rhr=None,
            hr_max=None,
            sex=None,
        ).method
        == "none"
    )


def test_strain_scale_and_steps():
    assert load.strain(0) == 0
    assert load.strain(load.nonworkout_trimp(15000)) == pytest.approx(3.0, abs=0.3)
    assert 15 <= load.strain(250) <= 18
    assert load.strain(10_000) <= 21
    assert load.nonworkout_trimp(8000, workout_steps=9000) == 0
    assert [load.strain_band(v) for v in (3, 8, 12, 16)] == ["Light", "Moderate", "High", "All out"]


def test_training_load_ewma_seeded_and_status():
    d0 = date(2026, 1, 1)
    days = [d0 + timedelta(days=k) for k in range(120)]
    steady = load.training_load(days, {d: 100.0 for d in days[30:]})
    assert steady[0].day == days[30]  # starts at the first day with load
    assert steady[-1].ctl == pytest.approx(100, abs=0.5)  # seeded, not ramping up from 0
    block = load.training_load(days, {d: (200.0 if d >= days[100] else 100.0) for d in days})
    assert block[-1].atl > block[-1].ctl and block[-1].tsb < 0
    assert load.training_load(days, {}) == []
    assert load.load_status(100, 100, 120) == ("Productive", 1.0)
    assert load.load_status(160, 100, 120)[0] == "Overload"
    assert load.load_status(50, 100, 120)[0] == "Detraining"
    assert load.load_status(50, 100, 20)[0] == "Building baseline"


# ---------------------------------------------------------------- energy

T0 = datetime(2026, 10, 1, 7, 0)


def test_stress_summary_awake_only():
    samples = [(T0 + timedelta(minutes=10 * k), 30 if k < 6 else 70) for k in range(12)]
    asleep = [(T0, T0 + timedelta(minutes=30))]
    s = energy.stress_summary(samples, asleep)
    assert s.samples == 9 and s.high_minutes == 55
    assert 45 < s.mean_awake < 60
    assert energy.stress_summary([]).mean_awake is None


def test_energy_bank_typical_day_ends_low_but_not_empty():
    wake, now = T0, T0 + timedelta(hours=15)
    stress = [(wake + timedelta(minutes=10 * k), 35) for k in range(90)]
    run = [(wake + timedelta(hours=10), wake + timedelta(hours=10, minutes=45), 80.0)]
    pts = energy.energy_bank(wake, now, 75, stress, run)
    assert pts[0].value == 75 and len(pts) == 15 * 12 + 1
    assert 10 <= pts[-1].value <= 35
    calm = energy.energy_bank(wake, wake + timedelta(hours=2), 50, [(wake, 10)], [])
    assert calm[-1].value > calm[0].value - 3  # calm refill offsets most of the base drain
    assert energy.energy_bank(wake, now, 5, stress, run)[-1].value == 0  # clamped


# ---------------------------------------------------------------- fitness


def _run(minutes=40, speed=3.2, hr=155, start_hr=120, pause=None, t0=0):
    rows, dist = [], 0.0
    for t in range(minutes * 60):
        if pause and pause[0] <= t < pause[1]:
            continue
        h = start_hr + (hr - start_hr) * min(1, t / 300)
        dist += speed
        rows.append(
            {
                "t": t0 + t,
                "hr": round(h),
                "speed_mps": speed,
                "distance_m": dist,
                "alt_m": 10.0,
                "cadence": 168,
            }
        )
    return rows


def test_steady_windows_and_hr_pace_vo2max():
    rows = _run(40, speed=3.2, hr=155)
    ws = fitness.steady_windows(rows)
    assert len(ws) == 1 and ws[0].t0 >= 300 and ws[0].seconds > 1700
    v = fitness.vo2max_from_windows(ws, rhr=55, hr_max=195)
    # ACSM: 3.5 + 0.2*192 = 41.9 ; HRR = 100/140
    assert v == pytest.approx(41.9 / (100 / 140), abs=0.2)
    # a pause splits windows; nothing spans the gap
    paused = fitness.steady_windows(_run(40, pause=(1200, 1300)))
    assert all(not (w.t0 < 1200 < w.t1) for w in paused)


def test_unsteady_run_has_no_windows():
    rows = _run(30)
    for k, r in enumerate(rows):
        r["speed_mps"] = 2.5 if (k // 30) % 2 else 4.0  # 30 s on / 30 s off intervals
    assert fitness.steady_windows(rows) == []


def test_combine_runs_drops_outliers():
    mean, sd, n = fitness.combine_runs([(1, 50.0), (5, 51.0), (9, 49.0), (12, 70.0)])
    assert n == 3 and 49 <= mean <= 51 and sd >= 2.0


def test_daniels_vdot_and_race_time_round_trip():
    v = fitness.vdot(5000, 20 * 60)  # 20:00 5K ≈ VDOT 49.8
    assert v == pytest.approx(49.8, abs=0.3)
    assert fitness.race_time(v, 5000) == pytest.approx(1200, abs=2)
    assert fitness.race_time(v, 10000) > 2 * 1200  # slower per km over 10K


def test_best_efforts_and_vdot_bounds():
    rows = _run(30, speed=3.6, hr=182)
    eff = fitness.best_efforts(rows)
    five = next(e for e in eff if e.kind == "dist" and e.target == 5000)
    assert five.seconds == pytest.approx(5000 / 3.6, abs=2)
    hit = fitness.vdot_from_efforts(eff, hr_max=195, moving_s=1800)
    assert hit is not None and hit[2] is True  # a 20+ min effort is most of a 30 min run
    seg = fitness.vdot_from_efforts(eff, hr_max=195, moving_s=4000)
    assert seg[2] is False  # same effort inside a much longer run: lower bound only
    assert fitness.vdot_from_efforts(fitness.best_efforts(_run(30, hr=150)), 195) is None


def test_critical_speed_needs_two_runs_and_real_d_prime():
    cs, dp = 4.0, 200.0
    pts = [(t, cs * t + dp, i % 2) for i, t in enumerate((180, 300, 480, 720, 1200))]
    fit = fitness.critical_speed(pts)
    assert fit.cs == pytest.approx(4.0, abs=0.01) and fit.d_prime == pytest.approx(200, abs=1)
    assert fitness.vo2max_from_cs(fit) == pytest.approx(fitness.vdot(10000, 2500), abs=0.1)
    assert fitness.critical_speed([(t, d, 0) for t, d, _ in pts]) is None  # one run only
    flat = [(t, 3.5 * t, i % 2) for i, t in enumerate((180, 300, 480, 720))]
    assert fitness.critical_speed(flat) is None  # D' = 0: bests were not maximal


def test_prediction_vdot_rules():
    assert fitness.prediction_vdot(hr_pace=51.4, race_vdot=None, cs_vo2=None, lower_bound=None) == (
        45.2,
        "hr_pace_x_economy",
    )
    assert fitness.prediction_vdot(hr_pace=51.4, race_vdot=None, cs_vo2=None, lower_bound=46.0) == (
        46.0,
        "best_effort_floor",
    )
    assert fitness.prediction_vdot(hr_pace=51.4, race_vdot=44.0, cs_vo2=46.0, lower_bound=None) == (
        45.0,
        "performance",
    )
    assert (
        fitness.prediction_vdot(hr_pace=None, race_vdot=None, cs_vo2=None, lower_bound=None) is None
    )


def test_friel_lthr_and_hr_speed_line():
    rows = _run(45, speed=3.6, hr=176, start_hr=176)
    lthr = fitness.friel_lthr(rows, hr_max=195)
    assert lthr == (176.0, 3.6)
    assert fitness.friel_lthr(_run(45, hr=150), hr_max=195) is None  # not hard enough
    ws = [fitness.Window(0, 300, v, 0, 100 + 20 * v, 0) for v in (2.8, 3.0, 3.4, 3.8)]
    a, b, sd = fitness.hr_speed_line(ws)
    assert a == pytest.approx(100) and b == pytest.approx(20) and sd < 1e-6


def test_blend_inverse_variance():
    b = fitness.blend([fitness.Estimate("a", 50, 2), fitness.Estimate("b", 56, 4)])
    assert b.value == pytest.approx((50 / 4 + 56 / 16) / (1 / 4 + 1 / 16), abs=0.05)
    assert b.ci[0] < b.value < b.ci[1]
    assert fitness.blend([]) is None


def test_sustained_max_ignores_spikes():
    rows = [{"t": t, "hr": 170} for t in range(60)]
    rows[30]["hr"] = 230  # optical glitch
    assert fitness.sustained_max_hr(rows) == 170


# ---------------------------------------------------------------- bio age


def test_fitness_age_inverts_norms():
    assert bioage.fitness_age(48.0, "male") == pytest.approx(25)
    assert bioage.fitness_age(37.8, "male") == pytest.approx(45)
    assert bioage.fitness_age(30.9, "female") == pytest.approx(35)
    assert bioage.vo2_norm(30, "male") == pytest.approx(45.2)
    assert bioage.fitness_age(80, "male") == 15  # clamped


def test_bio_age_contributions_add_up():
    x = bioage.BioAgeInputs(
        age=40,
        sex="male",
        vo2max=48.0,
        rhr=54,
        hrv_ms=45,
        bmi=23,
        sleep_h=6.5,
        sleep_score=75,
        met_min_week=1200,
    )
    r = bioage.bio_age(x)
    assert r.fitness_age == pytest.approx(25)
    assert sum(r.contributions.values()) == pytest.approx(r.delta, abs=0.05)
    assert r.contributions["vo2max"] < 0 and r.contributions["rhr"] < 0
    assert r.adjustments["sleep"] == pytest.approx(2 * 0.5 + (70 - 75) / 10)
    assert r.value < 40


def test_bio_age_without_vo2max_and_missing_inputs():
    r = bioage.bio_age(bioage.BioAgeInputs(age=30, sex="female", rhr=78))
    assert r.fitness_age is None and r.value == 40  # +10 bpm -> +10 years, only input
    assert bioage.bio_age(bioage.BioAgeInputs(age=30, sex=None)).value == 30
