"""Journal insights: does a habit move the next morning's numbers? (DESIGN §7 Journal.) Pure.

For every tag, days are split into "yes" and "no" (yes/no tags), or above vs at-or-below the
median (number tags such as caffeine mg). The outcome is the next wake-up day's value, because
a habit on day D shows up in the night that ends on D+1. The effect is the difference of
means with a Welch standard error; |z| >= 2 is reported as "clear", >= 1 as "possible".
Each group needs `min_each` days, otherwise the tag is listed as needing more data, with
counts. Small-n results are noisy, so sample sizes always travel with the number.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass
from datetime import date, timedelta

OUTCOMES = {
    # metric: (label, unit, higher_is_better)
    "recovery": ("Recovery", "%", True),
    "sleep": ("Sleep score", "%", True),
    "hrv_ms": ("HRV", "ms", True),
    "rhr": ("Resting HR", "bpm", False),
}


@dataclass(frozen=True)
class Effect:
    tag: str
    metric: str
    kind: str  # boolean | numeric
    split: str  # "yes vs no" or "> 200 vs <= 200"
    n_yes: int
    n_no: int
    mean_yes: float | None
    mean_no: float | None
    diff: float | None  # yes minus no
    z: float | None
    strength: str  # clear | possible | none | need_more
    good: bool | None  # True when the habit goes with a better outcome


def _welch(a: list[float], b: list[float]) -> tuple[float, float | None]:
    diff = statistics.fmean(a) - statistics.fmean(b)
    va = statistics.variance(a) if len(a) > 1 else 0.0
    vb = statistics.variance(b) if len(b) > 1 else 0.0
    se = math.sqrt(va / len(a) + vb / len(b))
    return diff, (diff / se if se > 0 else None)


def tag_effects(
    entries: dict[date, dict[str, float]],
    outcomes: dict[date, dict[str, float]],
    *,
    min_each: int = 5,
) -> list[Effect]:
    by_tag: dict[str, dict[date, float]] = {}
    for d, tags in entries.items():
        for tag, v in tags.items():
            if v is not None:
                by_tag.setdefault(tag, {})[d] = v

    out: list[Effect] = []
    for tag, days in sorted(by_tag.items()):
        values = list(days.values())
        boolean = set(values) <= {0.0, 1.0}
        if boolean:
            cut, split = 0.5, "yes vs no"
        else:
            cut = statistics.median(values)
            split = f"> {cut:g} vs <= {cut:g}"
        for metric, (_, _, higher_better) in OUTCOMES.items():
            yes, no = [], []
            for d, v in days.items():
                o = outcomes.get(d + timedelta(days=1), {}).get(metric)
                if o is None:
                    continue
                (yes if v > cut else no).append(o)
            kind = "boolean" if boolean else "numeric"
            if len(yes) < min_each or len(no) < min_each:
                out.append(
                    Effect(
                        tag,
                        metric,
                        kind,
                        split,
                        len(yes),
                        len(no),
                        None,
                        None,
                        None,
                        None,
                        "need_more",
                        None,
                    )
                )
                continue
            diff, z = _welch(yes, no)
            strength = "none"
            if z is not None and abs(z) >= 2:
                strength = "clear"
            elif z is not None and abs(z) >= 1:
                strength = "possible"
            out.append(
                Effect(
                    tag,
                    metric,
                    kind,
                    split,
                    len(yes),
                    len(no),
                    round(statistics.fmean(yes), 1),
                    round(statistics.fmean(no), 1),
                    round(diff, 1),
                    round(z, 2) if z is not None else None,
                    strength,
                    (diff > 0) == higher_better if diff else None,
                )
            )
    rank = {"clear": 0, "possible": 1, "none": 2, "need_more": 3}
    out.sort(key=lambda e: (rank[e.strength], -abs(e.z or 0)))
    return out
