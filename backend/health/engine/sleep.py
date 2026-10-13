"""Sleep score (DESIGN §6.2)."""

from __future__ import annotations

from dataclasses import dataclass

from health.engine.baselines import clip


@dataclass(frozen=True)
class SleepInputs:
    asleep_s: int
    in_bed_s: int | None
    deep_s: int | None
    rem_s: int | None
    awake_count: int | None
    awake_s: int | None
    hr_min: int | None = None
    hr_avg: int | None = None
    rhr_28d: float | None = None  # daytime resting HR baseline
    sleep_hr_avg_28d: float | None = None
    bedtime_dev_min: float | None = None  # |bedtime - 14d median| in minutes
    waketime_dev_min: float | None = None
    need_s: int = 8 * 3600


WEIGHTS = {
    "duration": 35,
    "efficiency": 15,
    "restorative": 20,
    "continuity": 10,
    "hr_dip": 10,
    "consistency": 10,
}


def _lin(x: float, lo: float, hi: float) -> float:
    """0 at <= lo, 1 at >= hi, linear between."""
    if hi == lo:
        return 1.0
    return clip((x - lo) / (hi - lo), 0.0, 1.0)


def sleep_score(i: SleepInputs) -> tuple[float, dict[str, float]]:
    comp: dict[str, float] = {}
    comp["duration"] = _lin(i.asleep_s / i.need_s, 0.5, 1.0)
    comp["efficiency"] = _lin(i.asleep_s / i.in_bed_s, 0.75, 0.95) if i.in_bed_s else 0.85
    if i.deep_s is not None and i.rem_s is not None and i.asleep_s:
        comp["restorative"] = _lin((i.deep_s + i.rem_s) / i.asleep_s, 0.25, 0.45)
    else:
        comp["restorative"] = 0.7
    if i.awake_count is not None or i.awake_s is not None:
        cnt_pen = 0.15 * (i.awake_count or 0)
        min_pen = (i.awake_s or 0) / 3600.0  # 1 h awake -> -1.0
        comp["continuity"] = clip(1.0 - cnt_pen - min_pen * 0.5, 0.0, 1.0)
    else:
        comp["continuity"] = 0.8
    dip = 0.5
    if i.hr_min is not None and i.rhr_28d:
        dip = _lin((i.rhr_28d - i.hr_min) / i.rhr_28d, -0.05, 0.15)
    if i.hr_avg is not None and i.sleep_hr_avg_28d:
        dip = 0.5 * dip + 0.5 * _lin(
            (i.sleep_hr_avg_28d - i.hr_avg) / i.sleep_hr_avg_28d, -0.1, 0.1
        )
    comp["hr_dip"] = dip
    if i.bedtime_dev_min is not None and i.waketime_dev_min is not None:
        comp["consistency"] = 1.0 - _lin(max(i.bedtime_dev_min, i.waketime_dev_min), 30, 120)
    else:
        comp["consistency"] = 0.8
    score = sum(WEIGHTS[k] * v for k, v in comp.items())
    return round(score, 1), {k: round(v, 3) for k, v in comp.items()}
