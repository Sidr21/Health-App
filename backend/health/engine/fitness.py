"""Fitness models from per-second run streams: VO₂max (×3, blended), LTHR, threshold pace,
critical speed and race predictions. DESIGN §6.5–6.7. Pure functions.

A stream row is a dict with keys t (s), hr, speed_mps, distance_m, alt_m, cadence (any may be
None). Pauses show up as gaps in t; windows never span a gap longer than 10 s.

VO₂max estimators
1. **HR–pace** (Firstbeat-style): steady windows (≥ 3 min, after minute 5, |grade| < 3 %,
   speed CV < 8 %, cadence within 5 % of the run median, HR drift < 3 bpm/min). Oxygen cost
   from the ACSM running equation VO₂ = 3.5 + 0.2·v + 0.9·v·grade (v in m/min); fraction of
   VO₂max from heart-rate reserve. Per run: duration-weighted median; across runs: outliers
   (> 2.5 MAD) dropped, then a 30-day exponentially weighted mean.
2. **Best effort → VDOT** (Daniels & Gilbert): fastest 1 mi / 5 km / 10 km and 5–30 min
   segments that were genuinely hard (average HR ≥ 88 % HRmax). Only a race-like effort (most
   of the run) is an estimate; a hard segment inside a longer run is a lower bound.
3. **Critical speed**: least-squares fit of d = CS·t + D′ to hard 3–20 min bests pooled over
   at least two runs; VO₂max is the VDOT of running 10 km at CS (≈ 30–40 min race pace).
Race predictions use a performance VDOT (race-like efforts, CS), else HR–pace VO₂max × running
economy (0.88 by default, calibrated once a race-like effort exists), never below a proven
lower bound.
Blend: inverse-variance weighted mean; each estimator carries its own SD.

LTHR: Friel (last 20 min of a ≥ 30 min steady hard effort), HR at CS from the pooled HR–speed
line of steady windows, and a 0.89 × HRmax prior with a wide SD, blended the same way. A hard
effort also sets a floor: HR held for 10 continuous minutes is at most ~106 % of LTHR, so
LTHR ≥ best 10-min HR / 1.06; the floor replaces the prior when it is higher.
"""

from __future__ import annotations

import math
import statistics
from dataclasses import dataclass, field

GAP_S = 10
MIN_WINDOW_S = 180
SKIP_S = 300

# ---------------------------------------------------------------- stream helpers


def _clean(rows: list[dict]) -> list[dict]:
    return sorted((r for r in rows if r.get("t") is not None), key=lambda r: r["t"])


def _distance_series(rows: list[dict]) -> list[float]:
    """Cumulative distance, from the distance field when present, else integrated speed."""
    out, acc = [], 0.0
    have = sum(1 for r in rows if r.get("distance_m") is not None) > len(rows) * 0.8
    prev_t = None
    for r in rows:
        if have and r.get("distance_m") is not None:
            acc = r["distance_m"]
        elif prev_t is not None and r.get("speed_mps"):
            acc += r["speed_mps"] * min(GAP_S, r["t"] - prev_t)
        out.append(acc)
        prev_t = r["t"]
    return out


def sustained_max_hr(rows: list[dict], seconds: int = 5) -> int | None:
    """Highest HR held for `seconds` consecutive samples, ignoring spikes > 10 bpm/s."""
    hrs = [(r["t"], r.get("hr")) for r in _clean(rows) if r.get("hr")]
    best = None
    for i in range(len(hrs) - seconds + 1):
        chunk = hrs[i : i + seconds]
        if chunk[-1][0] - chunk[0][0] > seconds + 2:
            continue
        if any(abs(b[1] - a[1]) > 10 for a, b in zip(chunk, chunk[1:], strict=False)):
            continue
        v = min(h for _, h in chunk)
        best = v if best is None else max(best, v)
    return best


# ---------------------------------------------------------------- steady windows


@dataclass(frozen=True)
class Window:
    t0: float
    t1: float
    speed: float  # m/s
    grade: float
    hr: float
    drift: float  # bpm/min

    @property
    def seconds(self) -> float:
        return self.t1 - self.t0


def _slope(xs: list[float], ys: list[float]) -> float:
    mx, my = statistics.fmean(xs), statistics.fmean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True)) / den if den else 0.0


def steady_windows(rows: list[dict]) -> list[Window]:
    rows = _clean(rows)
    if len(rows) < MIN_WINDOW_S:
        return []
    dist = _distance_series(rows)
    cads = [r["cadence"] for r in rows if r.get("cadence")]
    cad_med = statistics.median(cads) if cads else None

    # 60-second chunks that are individually steady and flat
    chunks: list[dict] = []
    i = 0
    while i < len(rows):
        j = i
        while j + 1 < len(rows) and rows[j + 1]["t"] - rows[i]["t"] < 60:
            j += 1
        seg = rows[i : j + 1]
        span = seg[-1]["t"] - seg[0]["t"]
        gaps = any(b["t"] - a["t"] > GAP_S for a, b in zip(seg, seg[1:], strict=False))
        speeds = [r["speed_mps"] for r in seg if r.get("speed_mps")]
        hrs = [r["hr"] for r in seg if r.get("hr")]
        ok = (
            span >= 50 and not gaps and len(speeds) >= 0.8 * len(seg) and len(hrs) >= 0.8 * len(seg)
        )
        if ok:
            mean_v = statistics.fmean(speeds)
            cv = statistics.pstdev(speeds) / mean_v if mean_v else 1
            dd = dist[j] - dist[i]
            alts = [r["alt_m"] for r in (seg[0], seg[-1]) if r.get("alt_m") is not None]
            grade = (alts[1] - alts[0]) / dd if len(alts) == 2 and dd > 50 else 0.0
            cad = [r["cadence"] for r in seg if r.get("cadence")]
            cad_ok = not cad_med or not cad or abs(statistics.fmean(cad) / cad_med - 1) <= 0.05
            ok = (
                seg[0]["t"] >= SKIP_S
                and mean_v > 1.8
                and cv < 0.08
                and abs(grade) < 0.03
                and cad_ok
            )
            if ok:
                chunks.append(
                    {
                        "t0": seg[0]["t"],
                        "t1": seg[-1]["t"],
                        "v": mean_v,
                        "grade": grade,
                        "rows": seg,
                    }
                )
        i = j + 1

    # merge consecutive chunks at a similar speed
    windows: list[Window] = []
    run: list[dict] = []

    def flush() -> None:
        if not run:
            return
        t0, t1 = run[0]["t0"], run[-1]["t1"]
        if t1 - t0 < MIN_WINDOW_S:
            return
        seg = [r for c in run for r in c["rows"]]
        hrs = [(r["t"], r["hr"]) for r in seg if r.get("hr")]
        drift = _slope([t / 60 for t, _ in hrs], [h for _, h in hrs])
        if abs(drift) >= 3:
            return
        windows.append(
            Window(
                t0,
                t1,
                statistics.fmean(c["v"] for c in run),
                statistics.fmean(c["grade"] for c in run),
                statistics.fmean(h for _, h in hrs),
                round(drift, 2),
            )
        )

    for c in chunks:
        contiguous = run and c["t0"] - run[-1]["t1"] <= GAP_S
        similar = run and abs(c["v"] / statistics.fmean(x["v"] for x in run) - 1) <= 0.05
        if run and not (contiguous and similar):
            flush()
            run = []
        run.append(c)
    flush()
    return windows


# ---------------------------------------------------------------- VO2max: HR–pace


def acsm_vo2(speed_mps: float, grade: float) -> float:
    v = speed_mps * 60
    return 3.5 + 0.2 * v + 0.9 * v * grade


def vo2max_from_windows(windows: list[Window], rhr: float, hr_max: float) -> float | None:
    vals, weights = [], []
    for w in windows:
        hrr = (w.hr - rhr) / (hr_max - rhr)
        if not 0.5 <= hrr <= 0.95:
            continue
        vals.append(acsm_vo2(w.speed, w.grade) / hrr)
        weights.append(w.seconds)
    if not vals:
        return None
    pairs = sorted(zip(vals, weights, strict=True))
    half, acc = sum(weights) / 2, 0.0
    for v, wt in pairs:
        acc += wt
        if acc >= half:
            return round(v, 1)
    return round(pairs[-1][0], 1)


def combine_runs(
    values: list[tuple[float, float]], half_life_days: float = 30
) -> tuple[float, float, int] | None:
    """values: (age_days, estimate). Drops > 2.5 MAD outliers, then exp-weighted mean.
    Returns (mean, sd, n_used)."""
    if not values:
        return None
    est = [v for _, v in values]
    med = statistics.median(est)
    mad = statistics.median(abs(v - med) for v in est) or 0.0
    kept = [(a, v) for a, v in values if mad == 0 or abs(v - med) <= 2.5 * 1.4826 * mad]
    w = [math.exp(-a / half_life_days) for a, _ in kept]
    mean = sum(wi * v for wi, (_, v) in zip(w, kept, strict=True)) / sum(w)
    sd = statistics.pstdev([v for _, v in kept]) if len(kept) > 1 else 3.0
    sd = max(2.0, sd / math.sqrt(len(kept))) if len(kept) > 1 else 3.0
    return round(mean, 1), round(sd, 2), len(kept)


# ---------------------------------------------------------------- best efforts + VDOT


def daniels_vo2(speed_mps: float) -> float:
    v = speed_mps * 60
    return -4.60 + 0.182258 * v + 0.000104 * v * v


def daniels_pct(t_min: float) -> float:
    return 0.8 + 0.1894393 * math.exp(-0.012778 * t_min) + 0.2989558 * math.exp(-0.1932605 * t_min)


def vdot(distance_m: float, time_s: float) -> float:
    return daniels_vo2(distance_m / time_s) / daniels_pct(time_s / 60)


def race_time(vdot_value: float, distance_m: float) -> float:
    """Seconds to run `distance_m` at a given VDOT (bisection on Daniels' equations)."""
    lo, hi = distance_m / 10, distance_m / 1.0  # 10 m/s .. 1 m/s
    for _ in range(80):
        mid = (lo + hi) / 2
        if vdot(distance_m, mid) > vdot_value:
            lo = mid  # too fast for this VDOT
        else:
            hi = mid
    return round((lo + hi) / 2)


@dataclass(frozen=True)
class Effort:
    kind: str  # "dist" | "time"
    target: float  # metres or seconds
    distance_m: float
    seconds: float
    avg_hr: float | None
    t0: float


FLOOR_SECONDS = 600
FLOOR_RATIO = 1.06  # a 10-min all-out effort averages ~104-106 % of LTHR


def sustained_hr(rows: list[dict], seconds: int = FLOOR_SECONDS) -> float | None:
    """Highest mean HR over `seconds` of continuous recording (no gap > 10 s)."""
    rows = [r for r in _clean(rows) if r.get("hr")]
    best = None
    for seg in _segments(rows):
        sub = [rows[k] for k in seg]
        if not sub or sub[-1]["t"] - sub[0]["t"] < seconds:
            continue
        total, j = 0.0, 0
        for i in range(len(sub)):
            while j < len(sub) and sub[j]["t"] - sub[i]["t"] < seconds:
                total += sub[j]["hr"]
                j += 1
            if j >= len(sub):
                break
            mean = total / (j - i)
            best = mean if best is None else max(best, mean)
            total -= sub[i]["hr"]
    return round(best, 1) if best is not None else None


def lthr_floor(rows: list[dict]) -> float | None:
    h = sustained_hr(rows)
    return round(h / FLOOR_RATIO, 1) if h else None


def _segments(rows: list[dict]) -> list[list[int]]:
    """Index ranges of continuous recording (no gap > 10 s)."""
    segs, cur = [], [0]
    for k in range(1, len(rows)):
        if rows[k]["t"] - rows[k - 1]["t"] > GAP_S:
            segs.append(cur)
            cur = [k]
        else:
            cur.append(k)
    segs.append(cur)
    return segs


def best_efforts(
    rows: list[dict],
    distances: tuple[float, ...] = (1609.344, 5000, 10000),
    durations: tuple[int, ...] = (180, 300, 480, 720, 1200, 1800),
) -> list[Effort]:
    rows = _clean(rows)
    if len(rows) < 120:
        return []
    dist = _distance_series(rows)
    hr_prefix = [0.0]
    hr_n = [0]
    for r in rows:
        hr_prefix.append(hr_prefix[-1] + (r.get("hr") or 0))
        hr_n.append(hr_n[-1] + (1 if r.get("hr") else 0))

    def avg_hr(i: int, j: int) -> float | None:
        n = hr_n[j + 1] - hr_n[i]
        return (hr_prefix[j + 1] - hr_prefix[i]) / n if n else None

    out: list[Effort] = []
    segs = _segments(rows)
    for D in distances:
        best = None
        for seg in segs:
            j = seg[0]
            for i in seg:
                while j <= seg[-1] and dist[j] - dist[i] < D:
                    j += 1
                if j > seg[-1]:
                    break
                secs = rows[j]["t"] - rows[i]["t"]
                if best is None or secs < best[0]:
                    best = (secs, i, j)
        if best:
            secs, i, j = best
            out.append(Effort("dist", D, D, secs, avg_hr(i, j), rows[i]["t"]))
    for T in durations:
        best = None
        for seg in segs:
            j = seg[0]
            for i in seg:
                while j <= seg[-1] and rows[j]["t"] - rows[i]["t"] < T:
                    j += 1
                if j > seg[-1]:
                    break
                d = (dist[j] - dist[i]) * T / max(1, rows[j]["t"] - rows[i]["t"])
                if best is None or d > best[0]:
                    best = (d, i, j)
        if best:
            d, i, j = best
            out.append(Effort("time", T, d, T, avg_hr(i, j), rows[i]["t"]))
    return out


def vdot_from_efforts(
    efforts: list[Effort], hr_max: float, moving_s: float | None = None
) -> tuple[float, Effort, bool] | None:
    """Best VDOT among hard efforts of 5–60 min (avg HR >= 88 % HRmax).

    Returns (vdot, effort, race_like). An effort is race-like when it covers >= 70 % of the
    run's moving time: then it is an estimate. A hard segment inside a longer run was not
    all-out, so its VDOT is only a lower bound."""
    best = None
    for e in efforts:
        if not 300 <= e.seconds <= 3600 or not e.avg_hr or e.avg_hr < 0.88 * hr_max:
            continue
        v = vdot(e.distance_m, e.seconds)
        if best is None or v > best[0]:
            race_like = bool(moving_s) and e.seconds >= 0.7 * moving_s
            best = (round(v, 1), e, race_like)
    return best


ECONOMY_DEFAULT = 0.88  # race VDOT / physiological VO2max for a typical recreational runner


def prediction_vdot(
    *,
    hr_pace: float | None,
    race_vdot: float | None,
    cs_vo2: float | None,
    lower_bound: float | None,
    economy: float | None = None,
) -> tuple[float, str] | None:
    """VDOT used for race predictions. Performance-based numbers (race-like efforts, critical
    speed) win; otherwise the HR–pace VO2max scaled by running economy. Never below what a
    recorded effort already proved."""
    perf = [v for v in (race_vdot, cs_vo2) if v]
    if perf:
        value, method = statistics.fmean(perf), "performance"
    elif hr_pace:
        value, method = hr_pace * (economy or ECONOMY_DEFAULT), "hr_pace_x_economy"
    else:
        return None
    if lower_bound and lower_bound > value:
        value, method = lower_bound, "best_effort_floor"
    return round(value, 1), method


# ---------------------------------------------------------------- critical speed


@dataclass(frozen=True)
class CriticalSpeed:
    cs: float  # m/s
    d_prime: float  # m
    r2: float
    n: int


def critical_speed(points: list[tuple[float, float, int]]) -> CriticalSpeed | None:
    """points: (seconds, metres, run id) of hard bests between 3 and 20 minutes, pooled over
    recent runs (best distance per duration). Bests that all come from one run are not
    maximal at every duration, so at least two runs must contribute, and D' must look like
    a real anaerobic reserve (50–600 m)."""
    pts = [(t, d, rid) for t, d, rid in points if 150 <= t <= 1260]
    if len(pts) < 3 or len({rid for *_, rid in pts}) < 2:
        return None
    ts, ds = [t for t, _, _ in pts], [d for _, d, _ in pts]
    cs = _slope(ts, ds)
    dp = statistics.fmean(ds) - cs * statistics.fmean(ts)
    ss_tot = sum((d - statistics.fmean(ds)) ** 2 for d in ds)
    ss_res = sum((d - (cs * t + dp)) ** 2 for t, d, _ in pts)
    r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
    if not (2.0 <= cs <= 7.0) or not (50 <= dp <= 600) or r2 < 0.9:
        return None
    return CriticalSpeed(round(cs, 3), round(dp, 1), round(r2, 4), len(pts))


def vo2max_from_cs(cs: CriticalSpeed) -> float:
    return round(vdot(10000, 10000 / cs.cs), 1)


# ---------------------------------------------------------------- LTHR


def friel_lthr(rows: list[dict], hr_max: float) -> tuple[float, float] | None:
    """(LTHR, speed) from the fastest ≥ 30 min continuous steady segment at ≥ 85 % HRmax."""
    rows = _clean(rows)
    best = None
    for seg in _segments(rows):
        if rows[seg[-1]]["t"] - rows[seg[0]]["t"] < 1800:
            continue
        sub = [rows[k] for k in seg]
        for start in range(0, len(sub), 60):
            end = start
            while end < len(sub) and sub[end]["t"] - sub[start]["t"] < 1800:
                end += 1
            if end >= len(sub):
                break
            win = sub[start : end + 1]
            speeds = [r["speed_mps"] for r in win if r.get("speed_mps")]
            hrs = [r["hr"] for r in win if r.get("hr")]
            if len(speeds) < 0.8 * len(win) or len(hrs) < 0.8 * len(win):
                continue
            mean_v = statistics.fmean(speeds)
            if mean_v <= 0 or statistics.pstdev(speeds) / mean_v > 0.10:
                continue
            if statistics.fmean(hrs) < 0.85 * hr_max:
                continue
            last20 = [r["hr"] for r in win if r.get("hr") and r["t"] >= win[-1]["t"] - 1200]
            cand = (mean_v, statistics.fmean(last20))
            if best is None or cand[0] > best[0]:
                best = cand
    return (round(best[1], 1), round(best[0], 3)) if best else None


def hr_speed_line(windows: list[Window]) -> tuple[float, float, float] | None:
    """HR = a + b·speed over steady windows: (a, b, residual SD). Needs a spread of speeds."""
    if len(windows) < 3:
        return None
    xs, ys = [w.speed for w in windows], [w.hr for w in windows]
    if max(xs) - min(xs) < 0.3:
        return None
    b = _slope(xs, ys)
    if b <= 0:
        return None
    a = statistics.fmean(ys) - b * statistics.fmean(xs)
    res = [y - (a + b * x) for x, y in zip(xs, ys, strict=True)]
    return a, b, statistics.pstdev(res)


# ---------------------------------------------------------------- blending


@dataclass(frozen=True)
class Estimate:
    method: str
    value: float
    sd: float
    inputs: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Blend:
    value: float
    ci: tuple[float, float]
    parts: list[Estimate]


def blend(parts: list[Estimate]) -> Blend | None:
    parts = [p for p in parts if p.value is not None and p.sd > 0]
    if not parts:
        return None
    w = [1 / p.sd**2 for p in parts]
    mean = sum(wi * p.value for wi, p in zip(w, parts, strict=True)) / sum(w)
    se = math.sqrt(1 / sum(w))
    return Blend(round(mean, 1), (round(mean - 1.96 * se, 1), round(mean + 1.96 * se, 1)), parts)
