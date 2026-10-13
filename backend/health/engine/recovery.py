"""Recovery score (DESIGN §6.3)."""

from __future__ import annotations

from dataclasses import dataclass

from health.engine.baselines import Baseline, clip, sigmoid

CALIBRATION_DAYS = 14
FULL_CONFIDENCE_DAYS = 28


@dataclass(frozen=True)
class RecoveryInputs:
    ln_rmssd: float | None
    ln_rmssd_base: Baseline
    rhr: float | None
    rhr_base: Baseline
    sleep_score: float | None
    sleep_hr_avg: float | None = None
    sleep_hr_base: Baseline | None = None
    strain_yesterday: float | None = None
    strain_base: Baseline | None = None


WEIGHTS = {"hrv": 0.40, "rhr": 0.25, "sleep": 0.20, "sleep_hr": 0.10, "strain": 0.05}
Z_CLIP = 2.5
# sigmoid(k * sum) with the 0-point mapped to 67 (green starts at 67):
# 100*sigmoid(x0) = 67 -> x0 = ln(67/33) ~ 0.708
_X0 = 0.708
_K = 1.6


@dataclass(frozen=True)
class RecoveryResult:
    score: float | None
    band: str | None  # green|amber|red
    components: dict[str, float | None]
    n_days: int
    calibrating: bool


def band_for(score: float) -> str:
    return "green" if score >= 67 else "amber" if score >= 34 else "red"


def recovery_score(i: RecoveryInputs) -> RecoveryResult:
    zs: dict[str, float | None] = {}
    z = i.ln_rmssd_base.z(i.ln_rmssd)
    zs["hrv"] = clip(z, -Z_CLIP, Z_CLIP) if z is not None else None
    z = i.rhr_base.z(i.rhr)
    zs["rhr"] = clip(-z, -Z_CLIP, Z_CLIP) if z is not None else None
    zs["sleep"] = (
        clip((i.sleep_score - 70) / 15, -Z_CLIP, Z_CLIP) if i.sleep_score is not None else None
    )
    if i.sleep_hr_base is not None:
        z = i.sleep_hr_base.z(i.sleep_hr_avg)
        zs["sleep_hr"] = clip(-z, -Z_CLIP, Z_CLIP) if z is not None else None
    else:
        zs["sleep_hr"] = None
    if i.strain_base is not None:
        z = i.strain_base.z(i.strain_yesterday)
        zs["strain"] = clip(-max(z, 0.0), -Z_CLIP, 0.0) if z is not None else None
    else:
        zs["strain"] = None

    n_days = i.ln_rmssd_base.n
    if zs["hrv"] is None and zs["rhr"] is None:
        return RecoveryResult(None, None, zs, n_days, True)
    used = {k: v for k, v in zs.items() if v is not None}
    wsum = sum(WEIGHTS[k] for k in used)
    x = sum(WEIGHTS[k] * v for k, v in used.items()) / wsum
    score = round(100 * sigmoid(_X0 + _K * x), 1)
    return RecoveryResult(score, band_for(score), zs, n_days, n_days < CALIBRATION_DAYS)
