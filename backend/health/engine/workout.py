"""Per-workout heart-rate metrics (DESIGN §6.7, §6.9). Pure functions.

- HRmax: a set value (user / field test) wins; otherwise the higher of the highest HR seen in
  workouts and Tanaka's age formula (208 - 0.7 * age), because observed maxima from easy
  training understate it.
- Zones (DESIGN §6.9, §6.11) come from threshold heart rate when we have one (Friel's run
  zones: Z1 < 85 %, Z2 85-89, Z3 90-94, Z4 95-99, Z5 >= 100 % of LTHR, capped at HRmax), else
  from % of HRmax (Z1 < 60, Z2 60-70, Z3 70-80, Z4 80-90, Z5 >= 90). LTHR is the user's own
  value, else our blended estimate, else the 0.89 x HRmax prior. Every result says which.
- Pace zones from threshold pace (Friel, % of threshold pace as time per km): Z1 slower than
  129 %, Z2 114-129, Z3 106-113, Z4 99-105, Z5 faster than 99 %.
- Time in zone comes from the per-second stream when we have the FIT file, otherwise it is
  estimated from lap averages (each lap's time goes to the zone of its average HR).
- Cardio focus: low aerobic = Z1+Z2, high aerobic = Z3+Z4, anaerobic = Z5.
- HR recovery: the largest 60 s drop that starts at the end of >= 3 min above Z3, i.e. the
  first minute after a hard effort. Needs the stream.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

ZONE_BOUNDS = [0.0, 0.60, 0.70, 0.80, 0.90]  # lower bounds as fraction of HRmax, Z1..Z5
ZONE_NAMES = ["Recovery", "Endurance", "Tempo", "Threshold", "Max"]
LTHR_BOUNDS = [0.0, 0.85, 0.90, 0.95, 1.00]  # lower bounds as fraction of LTHR (Friel, run)
LTHR_NAMES = ["Recovery", "Aerobic", "Tempo", "Threshold", "VO₂max"]
# pace zones: bounds on time per km as a fraction of threshold pace, slowest first
PACE_BOUNDS = [None, 1.29, 1.13, 1.05, 0.99]
HRR_CUTOFFS = [(49, "Superior"), (40, "Excellent"), (32, "Good"), (15, "Fair"), (0, "Poor")]


@dataclass(frozen=True)
class HrMax:
    value: int
    method: str  # user | field_test | observed | age_formula
    candidates: dict[str, int]


def estimate_hr_max(
    dob: date | None,
    today: date,
    observed: list[int],
    set_value: int | None = None,
    set_source: str | None = None,
) -> HrMax | None:
    candidates: dict[str, int] = {}
    if dob is not None:
        age = (today - dob).days / 365.25
        candidates["age_formula"] = round(208 - 0.7 * age)
    obs = [h for h in observed if 100 <= h <= 230]
    if obs:
        candidates["observed"] = max(obs)
    if set_value:
        candidates[set_source or "user"] = set_value
        return HrMax(set_value, set_source or "user", candidates)
    if not candidates:
        return None
    method = max(candidates, key=lambda k: candidates[k])
    return HrMax(candidates[method], method, candidates)


@dataclass(frozen=True)
class ZoneModel:
    """Heart-rate zones as lower bpm bounds of Z1..Z5 (Z1's is 0)."""

    basis: str  # lthr | hr_max
    hr_max: int
    lthr: float | None
    lthr_source: str | None  # user | ours | prior
    lower: tuple[int, ...]
    names: tuple[str, ...]

    def zone_of(self, hr: float) -> int:
        z = 1
        for i, lo in enumerate(self.lower):
            if hr >= lo:
                z = i + 1
        return z

    def table(self) -> list[dict]:
        out = []
        for i, lo in enumerate(self.lower):
            hi = self.lower[i + 1] - 1 if i + 1 < len(self.lower) else None
            out.append({"zone": i + 1, "name": self.names[i], "lo_bpm": lo or None, "hi_bpm": hi})
        return out

    def describe(self) -> dict:
        return {
            "basis": self.basis,
            "hr_max": self.hr_max,
            "lthr": self.lthr,
            "lthr_source": self.lthr_source,
        }


def zone_model(
    hr_max: int, lthr: float | None = None, lthr_source: str | None = None, basis: str = "lthr"
) -> ZoneModel:
    """LTHR zones when asked for and the LTHR is plausible (60-100 % of HRmax), else HRmax."""
    if basis == "lthr" and lthr and 0.6 * hr_max <= lthr < hr_max:
        lower = tuple(round(f * lthr) for f in LTHR_BOUNDS)
        return ZoneModel("lthr", hr_max, round(lthr, 1), lthr_source, lower, tuple(LTHR_NAMES))
    lower = tuple(round(f * hr_max) for f in ZONE_BOUNDS)
    return ZoneModel("hr_max", hr_max, None, None, lower, tuple(ZONE_NAMES))


def _model(m: ZoneModel | int) -> ZoneModel:
    return m if isinstance(m, ZoneModel) else zone_model(m, basis="hr_max")


def zones(m: ZoneModel | int) -> list[dict]:
    return _model(m).table()


def zone_of(hr: float, m: ZoneModel | int) -> int:
    return _model(m).zone_of(hr)


def time_in_zones_stream(
    samples: list[tuple[float, int | None]], m: ZoneModel | int
) -> list[float]:
    """samples: (t seconds, hr). Each sample owns the gap to the next one, capped at 10 s."""
    model = _model(m)
    secs = [0.0] * 5
    pts = [(t, hr) for t, hr in samples if hr]
    for (t, hr), (t2, _) in zip(pts, pts[1:], strict=False):
        secs[model.zone_of(hr) - 1] += min(10.0, max(0.0, t2 - t))
    return secs


def time_in_zones_laps(
    laps: list[tuple[float | None, int | None]], m: ZoneModel | int
) -> list[float]:
    model = _model(m)
    secs = [0.0] * 5
    for dur, hr in laps:
        if dur and hr:
            secs[model.zone_of(hr) - 1] += dur
    return secs


def pace_zones(threshold_s_per_km: float) -> list[dict]:
    """Friel run pace zones; `fast_s`/`slow_s` bound each zone's time per km."""
    out = []
    names = LTHR_NAMES
    for i, f in enumerate(PACE_BOUNDS):
        slow = round(f * threshold_s_per_km) if f else None
        nxt = PACE_BOUNDS[i + 1] if i + 1 < len(PACE_BOUNDS) else None
        fast = round(nxt * threshold_s_per_km) + 1 if nxt else None
        out.append({"zone": i + 1, "name": names[i], "slow_s": slow, "fast_s": fast})
    return out


def cardio_focus(zone_secs: list[float]) -> dict[str, float] | None:
    total = sum(zone_secs)
    if total <= 0:
        return None
    return {
        "low_aerobic": round(100 * (zone_secs[0] + zone_secs[1]) / total, 1),
        "high_aerobic": round(100 * (zone_secs[2] + zone_secs[3]) / total, 1),
        "anaerobic": round(100 * zone_secs[4] / total, 1),
    }


def hr_recovery(samples: list[tuple], m: ZoneModel | int) -> dict | None:
    """Largest 60 s HR drop starting right after >= 3 min spent at or above Z3.

    samples: (t, hr) or (t, hr, speed_mps). With speed, the athlete must actually ease off:
    the minute after must average under 70 % of the effort's speed, so a dip in HR while
    still running (a downhill, a gel) is not mistaken for recovery."""
    pts = [(x[0], x[1]) for x in samples if x[1]]
    speed_at = {x[0]: x[2] for x in samples if len(x) > 2 and x[1]}
    if len(pts) < 120:
        return None
    z3 = _model(m).lower[2]
    times = [t for t, _ in pts]
    best = None
    j = 0  # index of the sample ~60 s after i
    k = 0  # start of the window ending at i
    for i, (t, hr) in enumerate(pts):
        while j < len(pts) - 1 and times[j] < t + 60:
            j += 1
        if times[j] < t + 55:
            break  # recording ends before a full minute
        while times[k] < t - 180:
            k += 1
        # the drop must be measured on continuous data: a paused watch hides the recovery
        if any(times[m + 1] - times[m] > 10 for m in range(k, j)):
            continue  # effort window and recovery minute both need continuous recording
        window = [h for _, h in pts[k : i + 1]]
        if t - times[k] < 170 or sum(window) / len(window) < z3:
            continue
        if speed_at:
            eff = [speed_at.get(tt) for tt in times[k : i + 1]]
            rec = [speed_at.get(tt) for tt in times[i + 1 : j + 1]]
            eff = [v for v in eff if v is not None]
            rec = [v for v in rec if v is not None]
            if eff and rec and sum(rec) / len(rec) >= 0.7 * (sum(eff) / len(eff)):
                continue  # still moving at effort pace: not a recovery
        drop = hr - pts[j][1]
        if best is None or drop > best["drop_bpm"]:
            best = {"drop_bpm": drop, "from_bpm": hr, "to_bpm": pts[j][1], "at_s": t}
    if best is None or best["drop_bpm"] < 5:
        return None  # no effort ended inside the recording (e.g. stopped at the finish)
    best["rating"] = next(label for cut, label in HRR_CUTOFFS if best["drop_bpm"] >= cut)
    return best


def downsample(rows: list[dict], n: int = 300) -> list[dict]:
    if len(rows) <= n:
        return rows
    step = len(rows) / n
    return [rows[int(i * step)] for i in range(n)]
