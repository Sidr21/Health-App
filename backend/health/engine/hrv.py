"""Nightly HRV from COROS's raw sleep samples (DESIGN §6.1)."""

from __future__ import annotations

import math
import statistics
from collections.abc import Iterable
from dataclasses import dataclass

MIN_CONFIDENCE = 90_000  # COROS confidence is 0..100000
MIN_SAMPLES = 8


@dataclass(frozen=True)
class NightlyHrv:
    rmssd_ms: float | None  # exp(median lnRMSSD), i.e. a geometric-median style value
    ln_rmssd: float | None
    n_used: int
    n_total: int

    @property
    def usable(self) -> bool:
        return self.ln_rmssd is not None


def nightly_hrv(
    samples: Iterable[tuple[int, float, int | None]],
    *,
    window: tuple[int, int] | None = None,
    min_confidence: int = MIN_CONFIDENCE,
    last_hours: float | None = None,
) -> NightlyHrv:
    """Robust nightly HRV.

    samples: (unix_ts, rmssd_ms, confidence) tuples for one wake-up day.
    window:  (start_ts, end_ts) of the main sleep; samples outside are dropped.
    last_hours: if set, only the final N hours of the window are used (Bevel-style option).
    """
    pts = [(ts, v, c) for ts, v, c in samples if v and v > 0]
    n_total = len(pts)
    if window:
        start, end = window
        if last_hours:
            start = max(start, int(end - last_hours * 3600))
        pts = [p for p in pts if start <= p[0] <= end]
    pts = [p for p in pts if p[2] is None or p[2] >= min_confidence]
    if len(pts) < MIN_SAMPLES:
        return NightlyHrv(None, None, len(pts), n_total)
    ln_vals = [math.log(v) for _, v, _ in pts]
    med = statistics.median(ln_vals)
    return NightlyHrv(round(math.exp(med), 1), med, len(pts), n_total)
