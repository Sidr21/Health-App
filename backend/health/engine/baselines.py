"""Rolling baselines and z-scores used by every score (DESIGN §6.1, §6.3)."""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class Baseline:
    mean: float | None
    sd: float | None
    n: int

    def z(self, x: float | None, min_sd: float = 1e-6) -> float | None:
        if x is None or self.mean is None or self.sd is None or self.n < 3:
            return None
        return (x - self.mean) / max(self.sd, min_sd)


def rolling_baseline(
    values: Sequence[float | None], window: int, *, exclude_last: bool = True
) -> Baseline:
    """Mean/SD of the last `window` non-null values.

    `values` is ordered oldest -> newest and the last element is "today". With
    `exclude_last` the baseline describes the days *before* today, so today's z-score is
    measured against history rather than against itself.
    """
    hist = list(values[:-1] if exclude_last else values)
    tail = [v for v in hist[-window:] if v is not None]
    n = len(tail)
    if n == 0:
        return Baseline(None, None, 0)
    mean = sum(tail) / n
    if n < 2:
        return Baseline(mean, None, n)
    var = sum((v - mean) ** 2 for v in tail) / (n - 1)
    return Baseline(mean, math.sqrt(var), n)


def ewma(values: Sequence[float | None], span: int) -> float | None:
    """Exponentially weighted mean with pandas-style span; None values are skipped."""
    alpha = 2.0 / (span + 1.0)
    acc: float | None = None
    for v in values:
        if v is None:
            continue
        acc = v if acc is None else alpha * v + (1 - alpha) * acc
    return acc


def clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))
