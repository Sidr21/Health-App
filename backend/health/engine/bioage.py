"""Biological (fitness) age, DESIGN §6.8. Pure. Transparent, reproducible, not clinical.

    fitness_age  = age at which your VO₂max is the 50th percentile for your sex (FRIEND
                   registry treadmill norms, interpolated between decade midpoints)   w 0.45
    rhr_adj      = 1 year per bpm away from the sex norm (64 men / 68 women)          w 0.15
    hrv_adj      = −20 years per unit of ln(RMSSD / age norm), norm = 75 − 0.75·age  w 0.15
    body_adj     = 1 year per BMI point outside 18.5–25; 0.5 / % body fat above band w 0.10
    sleep_adj    = 2 years per hour outside 7–9 h, plus (70 − sleep score) / 10       w 0.10
    activity_adj = (500 − MET-min/week) / 100 below 500; up to −3 above 1000          w 0.05

Each adjustment is clamped to ±15 years. The non-fitness terms are renormalised over the
inputs that exist, so a missing input neither helps nor hurts:

    other   = age + Σ (w_i / Σ w_present) · adj_i
    bio_age = 0.45 · fitness_age + 0.55 · other     (other alone when VO₂max is missing)

Every term's contribution in years is returned so the screen can say what moved it.
"""

from __future__ import annotations

from dataclasses import dataclass

# FRIEND registry 50th-percentile VO2max (ml/kg/min), treadmill, by decade midpoint
VO2_NORMS = {
    "male": [(25, 48.0), (35, 42.4), (45, 37.8), (55, 32.6), (65, 28.2), (75, 24.4)],
    "female": [(25, 37.6), (35, 30.9), (45, 27.1), (55, 23.4), (65, 20.0), (75, 17.3)],
}
RHR_NORM = {"male": 64.0, "female": 68.0}
WEIGHTS = {"rhr": 0.15, "hrv": 0.15, "body": 0.10, "sleep": 0.10, "activity": 0.05}
FITNESS_WEIGHT = 0.45
CLAMP = 15.0
METHOD = "bioage_v1"


def sex_key(sex: str | None) -> str:
    return "female" if (sex or "").lower().startswith("f") else "male"


def vo2_norm(age: float, sex: str | None) -> float:
    pts = VO2_NORMS[sex_key(sex)]
    if age <= pts[0][0]:
        (a0, v0), (a1, v1) = pts[0], pts[1]
    elif age >= pts[-1][0]:
        (a0, v0), (a1, v1) = pts[-2], pts[-1]
    else:
        k = next(i for i in range(len(pts) - 1) if pts[i][0] <= age <= pts[i + 1][0])
        (a0, v0), (a1, v1) = pts[k], pts[k + 1]
    return v0 + (v1 - v0) * (age - a0) / (a1 - a0)


def fitness_age(vo2max: float, sex: str | None) -> float:
    """Inverse of vo2_norm (norms fall with age), extrapolated linearly, clamped to 15–95."""
    pts = VO2_NORMS[sex_key(sex)]
    if vo2max >= pts[0][1]:
        (a0, v0), (a1, v1) = pts[0], pts[1]
    elif vo2max <= pts[-1][1]:
        (a0, v0), (a1, v1) = pts[-2], pts[-1]
    else:
        k = next(i for i in range(len(pts) - 1) if pts[i][1] >= vo2max >= pts[i + 1][1])
        (a0, v0), (a1, v1) = pts[k], pts[k + 1]
    age = a0 + (vo2max - v0) * (a1 - a0) / (v1 - v0)
    return max(15.0, min(95.0, age))


def _clamp(x: float) -> float:
    return max(-CLAMP, min(CLAMP, x))


@dataclass(frozen=True)
class BioAgeInputs:
    age: float
    sex: str | None
    vo2max: float | None = None
    rhr: float | None = None  # 30-day mean
    hrv_ms: float | None = None  # 30-day mean nightly RMSSD
    bmi: float | None = None
    body_fat_pct: float | None = None
    sleep_h: float | None = None  # 30-day mean time asleep
    sleep_score: float | None = None
    met_min_week: float | None = None


@dataclass(frozen=True)
class BioAge:
    value: float
    age: float
    delta: float
    fitness_age: float | None
    contributions: dict[str, float]  # years added (+) or removed (−) by each input
    adjustments: dict[str, float]  # raw, unweighted adjustments in years


def bio_age(x: BioAgeInputs) -> BioAge:
    import math

    sex = sex_key(x.sex)
    adj: dict[str, float] = {}
    if x.rhr is not None:
        adj["rhr"] = _clamp(x.rhr - RHR_NORM[sex])
    if x.hrv_ms:
        norm = max(15.0, 75 - 0.75 * x.age)
        adj["hrv"] = _clamp(-20 * math.log(x.hrv_ms / norm))
    if x.bmi is not None or x.body_fat_pct is not None:
        b = 0.0
        if x.bmi is not None:
            b += max(0.0, x.bmi - 25) + max(0.0, 18.5 - x.bmi)
        if x.body_fat_pct is not None:
            hi = 20 if sex == "male" else 28
            b += 0.5 * max(0.0, x.body_fat_pct - hi)
        adj["body"] = _clamp(b)
    if x.sleep_h is not None or x.sleep_score is not None:
        sl = 0.0
        if x.sleep_h is not None:
            sl += 2 * (max(0.0, 7 - x.sleep_h) + max(0.0, x.sleep_h - 9))
        if x.sleep_score is not None:
            sl += (70 - x.sleep_score) / 10
        adj["sleep"] = _clamp(sl)
    if x.met_min_week is not None:
        m = x.met_min_week
        adj["activity"] = _clamp(
            (500 - m) / 100 if m < 500 else -min(3.0, max(0.0, m - 1000) / 500)
        )

    w_present = sum(WEIGHTS[k] for k in adj)
    other = x.age + (sum(WEIGHTS[k] / w_present * v for k, v in adj.items()) if adj else 0.0)
    contributions = {
        k: (WEIGHTS[k] / w_present * v) * (1 - FITNESS_WEIGHT if x.vo2max else 1.0)
        for k, v in adj.items()
    }
    fa = None
    if x.vo2max:
        fa = fitness_age(x.vo2max, sex)
        value = FITNESS_WEIGHT * fa + (1 - FITNESS_WEIGHT) * other
        contributions["vo2max"] = FITNESS_WEIGHT * (fa - x.age)
        adj["vo2max"] = fa - x.age
    else:
        value = other
    return BioAge(
        value=round(value, 1),
        age=round(x.age, 1),
        delta=round(value - x.age, 1),
        fitness_age=round(fa, 1) if fa is not None else None,
        contributions={k: round(v, 2) for k, v in contributions.items()},
        adjustments={k: round(v, 2) for k, v in adj.items()},
    )
