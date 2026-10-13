"""Cardio load: TRIMP per workout, daily strain (0–21) and CTL / ATL / TSB. DESIGN §6.4. Pure.

- **TRIMP** (Banister): Σ minutes × HRr × a·e^(b·HRr), HRr = (HR − RHR) / (HRmax − RHR),
  a, b = 0.64, 1.92 (men) or 0.86, 1.67 (women). From the per-second stream when we have it,
  else from the workout's average HR (which underestimates hard intervals a little), else from
  COROS's training load (~1 TRIMP per point), else nothing.
- **Non-workout load**: steps outside workouts at 0.0015 TRIMP per step (15 k steps ≈ 23 TRIMP).
- **Daily strain** = 21 · (1 − e^(−TRIMP / 150)): a 15 k-step rest day ≈ 3, an easy 45-min
  run ≈ 7–9, a hard session ≈ 15–18, and it saturates like Whoop's.
- **CTL / ATL** = exponentially weighted daily TRIMP with 42- and 7-day time constants, seeded
  with the first two weeks' mean; TSB = CTL − ATL (form). The cardio load gauge shows ATL
  with an optimal band of
  0.8–1.3 × CTL; status words come from ATL / CTL.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import date

STRAIN_MAX = 21.0
STRAIN_SCALE = 150.0
STEP_TRIMP = 0.0015
COROS_TL_TO_TRIMP = 1.0
CTL_DAYS = 42
ATL_DAYS = 7
METHOD = "trimp_banister_v1"


def _coeffs(sex: str | None) -> tuple[float, float]:
    return (0.86, 1.67) if (sex or "").lower().startswith("f") else (0.64, 1.92)


def hr_reserve(hr: float, rhr: float, hr_max: float) -> float:
    return max(0.0, min(1.2, (hr - rhr) / max(1.0, hr_max - rhr)))


def trimp_stream(
    samples: list[tuple[float, int | None]], rhr: float, hr_max: float, sex: str | None = None
) -> float:
    """samples: (t seconds, hr). Each sample owns the gap to the next, capped at 10 s."""
    a, b = _coeffs(sex)
    pts = [(t, hr) for t, hr in samples if hr]
    total = 0.0
    for (t, hr), (t2, _) in zip(pts, pts[1:], strict=False):
        dt = min(10.0, max(0.0, t2 - t)) / 60
        x = hr_reserve(hr, rhr, hr_max)
        total += dt * x * a * math.exp(b * x)
    return total


def trimp_average(
    duration_s: float, avg_hr: float, rhr: float, hr_max: float, sex: str | None = None
) -> float:
    a, b = _coeffs(sex)
    x = hr_reserve(avg_hr, rhr, hr_max)
    return duration_s / 60 * x * a * math.exp(b * x)


@dataclass(frozen=True)
class WorkoutLoad:
    trimp: float
    method: str  # stream | avg_hr | coros_load | none


def workout_trimp(
    *,
    stream: list[tuple[float, int | None]] | None,
    duration_s: float | None,
    avg_hr: float | None,
    coros_load: float | None,
    rhr: float | None,
    hr_max: float | None,
    sex: str | None,
) -> WorkoutLoad:
    if rhr and hr_max and stream and sum(1 for _, h in stream if h) > 60:
        return WorkoutLoad(round(trimp_stream(stream, rhr, hr_max, sex), 1), "stream")
    if rhr and hr_max and avg_hr and duration_s:
        return WorkoutLoad(round(trimp_average(duration_s, avg_hr, rhr, hr_max, sex), 1), "avg_hr")
    if coros_load:
        return WorkoutLoad(round(coros_load * COROS_TL_TO_TRIMP, 1), "coros_load")
    return WorkoutLoad(0.0, "none")


def nonworkout_trimp(steps: int | None, workout_steps: float = 0.0) -> float:
    if not steps:
        return 0.0
    return round(max(0.0, steps - workout_steps) * STEP_TRIMP, 1)


def strain(trimp: float) -> float:
    return round(STRAIN_MAX * (1 - math.exp(-max(0.0, trimp) / STRAIN_SCALE)), 1)


def strain_band(value: float) -> str:
    if value < 6:
        return "Light"
    if value < 11:
        return "Moderate"
    if value < 15:
        return "High"
    return "All out"


@dataclass(frozen=True)
class LoadPoint:
    day: date
    trimp: float
    ctl: float
    atl: float
    tsb: float


def training_load(
    days: list[date], trimp_by_day: dict[date, float], seed_days: int = 14
) -> list[LoadPoint]:
    """EWMA over consecutive days (missing days count as 0 TRIMP).

    The series starts at the first day with any load and both averages are seeded with the
    mean of its first `seed_days` days: starting from zero would understate CTL for weeks and
    make every early ratio look like overload."""
    kc = 1 - math.exp(-1 / CTL_DAYS)
    ka = 1 - math.exp(-1 / ATL_DAYS)
    first = next((i for i, d in enumerate(days) if trimp_by_day.get(d, 0) > 0), None)
    if first is None:
        return []
    days = days[first:]
    seed = [trimp_by_day.get(d, 0.0) for d in days[:seed_days]]
    ctl = atl = sum(seed) / len(seed)
    out = []
    for d in days:
        t = trimp_by_day.get(d, 0.0)
        ctl += (t - ctl) * kc
        atl += (t - atl) * ka
        out.append(LoadPoint(d, round(t, 1), round(ctl, 1), round(atl, 1), round(ctl - atl, 1)))
    return out


def load_status(atl: float, ctl: float, history_days: int) -> tuple[str, float | None]:
    if history_days < 28 or ctl <= 0:
        return "Building baseline", None
    ratio = atl / ctl
    if ratio < 0.8:
        return "Detraining", round(ratio, 2)
    if ratio <= 1.3:
        return "Productive", round(ratio, 2)
    if ratio <= 1.5:
        return "Overreaching", round(ratio, 2)
    return "Overload", round(ratio, 2)
