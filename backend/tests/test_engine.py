import math

from health.engine.baselines import Baseline, ewma, rolling_baseline
from health.engine.hrv import nightly_hrv
from health.engine.recovery import RecoveryInputs, recovery_score
from health.engine.sleep import SleepInputs, sleep_score


def test_rolling_baseline_excludes_today():
    vals = [50, 52, None, 48, 51, 70]  # today = 70
    b = rolling_baseline(vals, window=28)
    assert b.n == 4 and b.mean == 50.25
    assert b.z(70) > 2
    assert rolling_baseline([1.0], 7).n == 0
    assert rolling_baseline([1.0, 2.0], 7).sd is None


def test_ewma():
    assert ewma([1, 1, 1], span=7) == 1
    assert ewma([None, None], span=7) is None
    assert 1 < ewma([1, 2], span=3) < 2


def _night(values, conf=100000, start=0, step=300):
    return [(start + k * step, v, conf) for k, v in enumerate(values)]


def test_nightly_hrv_median_and_filters():
    base = [40, 42, 38, 45, 41, 39, 44, 43, 40, 42]
    r = nightly_hrv(_night(base))
    assert r.usable and r.n_used == 10
    assert abs(r.rmssd_ms - 41.5) < 0.6  # median of ln -> geometric median-ish
    # a wild spike with low confidence is dropped
    spiky = _night(base) + [(99999, 95, 80000)]
    r2 = nightly_hrv(spiky)
    assert r2.n_used == 10 and r2.n_total == 11
    # a wild spike with high confidence barely moves the median
    r3 = nightly_hrv(_night(base + [95]))
    assert abs(r3.rmssd_ms - r.rmssd_ms) < 1.5
    # too few samples -> unusable
    assert not nightly_hrv(_night(base[:5])).usable


def test_nightly_hrv_window_and_last_hours():
    pts = _night([30] * 12 + [50] * 12, step=600)  # 4 h night: first 2 h low, last 2 h high
    whole = nightly_hrv(pts, window=(0, 24 * 600))
    last = nightly_hrv(pts, window=(0, 24 * 600), last_hours=2)
    assert whole.rmssd_ms < last.rmssd_ms
    assert math.isclose(last.rmssd_ms, 50, abs_tol=0.1)


def test_sleep_score_ranges():
    good = SleepInputs(
        asleep_s=8 * 3600,
        in_bed_s=int(8.3 * 3600),
        deep_s=int(1.5 * 3600),
        rem_s=int(1.8 * 3600),
        awake_count=0,
        awake_s=10 * 60,
        hr_min=45,
        hr_avg=52,
        rhr_28d=55,
        sleep_hr_avg_28d=55,
        bedtime_dev_min=10,
        waketime_dev_min=15,
    )
    bad = SleepInputs(
        asleep_s=5 * 3600,
        in_bed_s=7 * 3600,
        deep_s=30 * 60,
        rem_s=40 * 60,
        awake_count=5,
        awake_s=90 * 60,
        hr_min=60,
        hr_avg=66,
        rhr_28d=55,
        sleep_hr_avg_28d=55,
        bedtime_dev_min=150,
        waketime_dev_min=90,
    )
    g, gc = sleep_score(good)
    b, bc = sleep_score(bad)
    assert g > 90 and b < 25
    assert set(gc) == {
        "duration",
        "efficiency",
        "restorative",
        "continuity",
        "hr_dip",
        "consistency",
    }


def _base(mean, sd, n=28):
    return Baseline(mean, sd, n)


def test_recovery_score_bands():
    ln_base = _base(math.log(45), 0.15)
    rhr_base = _base(56, 3)
    neutral = recovery_score(RecoveryInputs(math.log(45), ln_base, 56, rhr_base, 70))
    assert neutral.score is not None and 64 <= neutral.score <= 70 and not neutral.calibrating
    high = recovery_score(RecoveryInputs(math.log(60), ln_base, 50, rhr_base, 90))
    low = recovery_score(RecoveryInputs(math.log(32), ln_base, 64, rhr_base, 45))
    assert high.score > 85 and high.band == "green"
    assert low.score < 34 and low.band == "red"


def test_recovery_calibrating_and_missing():
    short = _base(math.log(45), 0.15, n=5)
    r = recovery_score(RecoveryInputs(math.log(45), short, 56, _base(56, 3, n=5), None))
    assert r.calibrating and r.score is not None
    none = recovery_score(
        RecoveryInputs(None, Baseline(None, None, 0), None, Baseline(None, None, 0), 80)
    )
    assert none.score is None


def test_minutes_of_day_wraps_at_noon():
    from datetime import datetime

    from health.compute import _dev_minutes, _minutes_of_day

    bed_2351 = _minutes_of_day(datetime(2026, 10, 12, 23, 51))
    ref = [
        _minutes_of_day(datetime(2026, 10, 1, h, m))
        for h, m in [(0, 35), (23, 27), (0, 58), (1, 2)]
    ]
    assert _dev_minutes(bed_2351, ref) < 60
