"""Stress summary and the Energy bank (DESIGN §6.4). Pure.

Stress: COROS's all-day stress is already HRV-based, so we only summarise it: time-weighted
mean while awake and minutes at or above 50 ("high stress").

Energy bank (0–100), simulated in 5-minute slots from wake-up to `now`:
- starts at the morning's recovery score (70 when there is none yet);
- awake baseline drain 2.0 / hour;
- stress drain: (stress − 25) / 25 × 1.5 per hour when stress > 25 (stress 75 ≈ −3 / h);
- calm refill: +1.0 per hour while stress < 25 (sitting still, resting);
- workouts drain 0.25 per TRIMP point, spread evenly over the workout.
Calibrated so a normal day with one moderate workout ends around 15–30.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

SLOT_MIN = 5
BASE_DRAIN_H = 2.0
STRESS_DRAIN_H = 1.5
CALM_REFILL_H = 1.0
TRIMP_DRAIN = 0.25
HIGH_STRESS = 50


@dataclass(frozen=True)
class StressSummary:
    mean_awake: float | None
    high_minutes: int
    samples: int


def stress_summary(
    samples: list[tuple[datetime, int]], asleep: list[tuple[datetime, datetime]] = ()
) -> StressSummary:
    """samples: (ts, stress 0–100), sorted. Each sample lasts until the next one (max 15 min)."""

    def awake(ts: datetime) -> bool:
        return not any(a <= ts < b for a, b in asleep)

    pts = [(ts, v) for ts, v in samples if v is not None and v >= 0 and awake(ts)]
    if not pts:
        return StressSummary(None, 0, 0)
    weighted = total = high = 0.0
    for (ts, v), nxt in zip(pts, [*pts[1:], None], strict=False):
        dur = 5.0 if nxt is None else min(15.0, (nxt[0] - ts).total_seconds() / 60)
        weighted += v * dur
        total += dur
        if v >= HIGH_STRESS:
            high += dur
    return StressSummary(round(weighted / total, 1) if total else None, int(round(high)), len(pts))


@dataclass(frozen=True)
class EnergyPoint:
    ts: datetime
    value: float


def energy_bank(
    wake: datetime,
    now: datetime,
    start: float | None,
    stress: list[tuple[datetime, int]],
    workouts: list[tuple[datetime, datetime, float]],
) -> list[EnergyPoint]:
    """workouts: (start, end, trimp). Returns one point per 5-minute slot from wake to now."""
    return energy_bank_detail(wake, now, start, stress, workouts)[0]


def energy_bank_detail(
    wake: datetime,
    now: datetime,
    start: float | None,
    stress: list[tuple[datetime, int]],
    workouts: list[tuple[datetime, datetime, float]],
) -> tuple[list[EnergyPoint], dict[str, float]]:
    """As energy_bank, plus the points each term moved the bank (before the 0–100 clamp):
    awake (−), stress (−), calm (+), workouts (−)."""
    totals = {"awake": 0.0, "stress": 0.0, "calm": 0.0, "workouts": 0.0}
    level = float(start if start is not None else 70.0)
    out = [EnergyPoint(wake, round(level, 1))]
    stress = sorted(stress)
    si = 0
    cur_stress: int | None = None
    t = wake
    step = timedelta(minutes=SLOT_MIN)
    per_h = SLOT_MIN / 60
    while t + step <= now:
        while si < len(stress) and stress[si][0] <= t:
            cur_stress = stress[si][1]
            si += 1
        parts = {"awake": -BASE_DRAIN_H * per_h, "stress": 0.0, "calm": 0.0, "workouts": 0.0}
        if cur_stress is not None and cur_stress > 25:
            parts["stress"] = -(cur_stress - 25) / 25 * STRESS_DRAIN_H * per_h
        elif cur_stress is not None:
            parts["calm"] = CALM_REFILL_H * per_h
        for ws, we, trimp in workouts:
            overlap = (min(we, t + step) - max(ws, t)).total_seconds()
            if overlap > 0:
                dur = max(60.0, (we - ws).total_seconds())
                parts["workouts"] -= trimp * TRIMP_DRAIN * overlap / dur
        for k, v in parts.items():
            totals[k] += v
        level = max(0.0, min(100.0, level + sum(parts.values())))
        t += step
        out.append(EnergyPoint(t, round(level, 1)))
    return out, {k: round(v, 1) for k, v in totals.items()}
