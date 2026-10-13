"""Parsers for the text (and one JSON) payloads returned by the official COROS MCP tools.

The MCP server formats most results as human-readable text, so ingestion through it means
parsing that text. Every parser is total: unknown lines are ignored, missing values become
None, and the raw text is always stored next to the parsed result by the caller.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

_DATE_RE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_COMPACT_DATE_RE = re.compile(r"^--- (\d{8}) ---$")


def _d(s: str) -> date:
    y, m, d = (int(x) for x in _DATE_RE.search(s).groups())  # type: ignore[union-attr]
    return date(y, m, d)


def _compact(s: str) -> date:
    return date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def _int(s: str | None) -> int | None:
    if s is None:
        return None
    m = re.search(r"-?\d[\d,]*", s)
    return int(m.group().replace(",", "")) if m else None


def _float(s: str | None) -> float | None:
    if s is None:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", s.replace(",", ""))
    return float(m.group()) if m else None


def parse_hms(s: str | None) -> int | None:
    """'1:24:33' | '37:18' | '5:28' | '8h 42min' | '18 min' | '0h' -> seconds."""
    if not s:
        return None
    s = s.strip()
    if ":" in s:
        parts = [int(p) for p in s.split(":")]
        while len(parts) < 3:
            parts.insert(0, 0)
        h, m, sec = parts[-3:]
        return h * 3600 + m * 60 + sec
    total = 0
    h = re.search(r"(\d+)\s*h", s)
    m = re.search(r"(\d+)\s*min", s)
    if h:
        total += int(h.group(1)) * 3600
    if m:
        total += int(m.group(1)) * 60
    return total if (h or m) else None


def parse_pace(s: str | None) -> float | None:
    """'6:10 /km' -> 370.0 seconds per km. Returns None for '-' or missing."""
    if not s:
        return None
    m = re.search(r"(\d+):(\d{2})", s)
    return int(m.group(1)) * 60 + int(m.group(2)) if m else None


# --------------------------------------------------------------------------- sport records


@dataclass
class SportRecord:
    label_id: str
    sport_type: int
    sport_name: str
    date: date
    start_ts: int | None = None
    end_ts: int | None = None
    duration_s: int | None = None
    distance_m: float | None = None
    avg_pace_s_per_km: float | None = None
    avg_speed_kmh: float | None = None
    avg_hr: int | None = None
    calories: int | None = None
    sets: int | None = None
    location: str | None = None
    lat: float | None = None
    lon: float | None = None


_RECORD_HEAD = re.compile(r"^\s*\d+\.\s+(?P<name>.+?)\s+—\s+(?P<date>\d{4}-\d{2}-\d{2})\s*$")


def parse_sport_records(text: str) -> list[SportRecord]:
    records: list[SportRecord] = []
    cur: dict[str, Any] | None = None

    def flush() -> None:
        if cur and cur.get("label_id"):
            records.append(SportRecord(**cur))

    for raw in text.splitlines():
        line = raw.strip()
        head = _RECORD_HEAD.match(line)
        if head:
            flush()
            cur = {"sport_name": head.group("name"), "date": _d(head.group("date"))}
            continue
        if cur is None or not line:
            continue
        if line.startswith("Location:"):
            cur["location"] = line.split(":", 1)[1].strip()
        elif line.startswith("Start Coordinates:"):
            nums = re.findall(r"-?\d+\.\d+", line)
            if len(nums) == 2:
                cur["lat"], cur["lon"] = float(nums[0]), float(nums[1])
        elif line.startswith("Time Window:"):
            st = re.search(r"startTimestamp=(\d+)", line)
            en = re.search(r"endTimestamp=(\d+)", line)
            cur["start_ts"] = int(st.group(1)) if st else None
            cur["end_ts"] = int(en.group(1)) if en else None
        elif line.startswith("Duration:"):
            # "Duration: 37:18 | Distance: 6.04 km"  or  "Duration: 5:47 | Sets: 3"
            for part in line.split("|"):
                k, _, v = part.partition(":")
                k, v = k.strip(), v.strip()
                if k == "Duration":
                    cur["duration_s"] = parse_hms(v)
                elif k == "Distance":
                    dist = _float(v)
                    if dist is not None:
                        cur["distance_m"] = dist * 1000 if "km" in v else dist
                elif k == "Sets":
                    cur["sets"] = _int(v)
        elif (
            line.startswith("Average Pace:")
            or line.startswith("Average Speed:")
            or (line.startswith("| Avg HR") or line.startswith("Avg HR"))
        ):
            for part in line.split("|"):
                k, _, v = part.partition(":")
                k, v = k.strip(), v.strip()
                if k == "Average Pace":
                    cur["avg_pace_s_per_km"] = parse_pace(v)
                elif k == "Average Speed":
                    cur["avg_speed_kmh"] = _float(v)
                elif k == "Avg HR":
                    cur["avg_hr"] = _int(v)
                elif k == "Calories":
                    cur["calories"] = _int(v)
        elif line.startswith("LabelId:"):
            lid = re.search(r"LabelId:\s*(\d+)", line)
            stype = re.search(r"SportType:\s*(\d+)", line)
            cur["label_id"] = lid.group(1) if lid else None
            cur["sport_type"] = int(stype.group(1)) if stype else 0
    flush()
    return records


# --------------------------------------------------------------------------- daily series


def parse_dated_values(text: str) -> dict[date, int | None]:
    """'2026-10-13: 57 bpm' lines -> {date: 57}; 'No data' -> None. Used for RHR and avg HR."""
    out: dict[date, int | None] = {}
    for line in text.splitlines():
        m = re.match(r"^\s*(\d{4}-\d{2}-\d{2}):\s*(.+)$", line)
        if not m:
            continue
        val = m.group(2).strip()
        out[_d(m.group(1))] = None if val.lower().startswith("no data") else _int(val)
    return out


@dataclass
class StressDay:
    date: date
    avg: int | None
    label: str | None


def parse_stress_level(text: str) -> list[StressDay]:
    out: list[StressDay] = []
    cur: date | None = None
    for line in text.splitlines():
        m = re.match(r"^\s*(\d{4}-\d{2}-\d{2}):\s*$", line)
        if m:
            cur = _d(m.group(1))
            continue
        if cur and line.strip().startswith("Average Stress:"):
            v = line.split(":", 1)[1]
            lab = re.search(r"\(([^)]+)\)", v)
            out.append(StressDay(cur, _int(v), lab.group(1) if lab else None))
    return out


@dataclass
class DailyHealth:
    date: date
    steps: int | None = None
    calories: int | None = None
    exercise_min: int | None = None
    stress_avg: int | None = None
    sleep_total_s: int | None = None
    sleep_deep_s: int | None = None
    sleep_light_s: int | None = None
    sleep_rem_s: int | None = None
    sleep_awake_s: int | None = None
    sleep_hr_avg: int | None = None
    sleep_hr_min: int | None = None
    sleep_hr_max: int | None = None


@dataclass
class DailyHealthReport:
    rhr: int | None
    hrv_baseline: int | None
    days: list[DailyHealth] = field(default_factory=list)


def parse_daily_health(text: str) -> DailyHealthReport:
    rhr = hrv_base = None
    head = re.search(r"Resting HR:\s*(\d+)", text)
    if head:
        rhr = int(head.group(1))
    hb = re.search(r"HRV Baseline:\s*(\d+)", text)
    if hb:
        hrv_base = int(hb.group(1))
    days: list[DailyHealth] = []
    cur: DailyHealth | None = None
    for raw in text.splitlines():
        line = raw.strip()
        m = _COMPACT_DATE_RE.match(line)
        if m:
            cur = DailyHealth(_compact(m.group(1)))
            days.append(cur)
            continue
        if cur is None:
            continue
        if line.startswith("Steps:"):
            for part in line.split("|"):
                k, _, v = part.partition(":")
                k = k.strip()
                if k == "Steps":
                    cur.steps = _int(v)
                elif k == "Calories":
                    cur.calories = _int(v)
                elif k == "Exercise":
                    cur.exercise_min = parse_hms(v) // 60 if parse_hms(v) is not None else None
        elif line.startswith("Stress:"):
            cur.stress_avg = _int(line)
        elif line.startswith("Total:"):
            for part in line.split("|"):
                k, _, v = part.partition(":")
                k = k.strip()
                secs = parse_hms(v)
                if k == "Total":
                    cur.sleep_total_s = secs
                elif k == "Deep":
                    cur.sleep_deep_s = secs
                elif k == "Light":
                    cur.sleep_light_s = secs
                elif k == "REM":
                    cur.sleep_rem_s = secs
                elif k == "Awake":
                    cur.sleep_awake_s = secs
        elif line.startswith("Sleep HR:"):
            for part in line.split("|"):
                v = part.split(":")[-1]
                if "Avg" in part:
                    cur.sleep_hr_avg = _int(v)
                elif "Min" in part:
                    cur.sleep_hr_min = _int(v)
                elif "Max" in part:
                    cur.sleep_hr_max = _int(v)
    return DailyHealthReport(rhr, hrv_base, days)


# --------------------------------------------------------------------------- sleep overview


@dataclass
class SleepOverview:
    date: date
    score: int | None = None
    daily_sleep_s: int | None = None
    main_asleep_s: int | None = None
    main_period_s: int | None = None
    deep_pct: int | None = None
    light_pct: int | None = None
    rem_pct: int | None = None
    awake_pct: int | None = None
    awake_s: int | None = None
    awake_count: int | None = None
    window_start: datetime | None = None
    window_end: datetime | None = None
    naps_s: int | None = None


_WINDOW_RE = re.compile(r"(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\s*-\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2})")


def parse_sleep_overview(text: str) -> list[SleepOverview]:
    out: list[SleepOverview] = []
    cur: SleepOverview | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", line):
            cur = SleepOverview(_d(line))
            out.append(cur)
            continue
        if cur is None or ":" not in line:
            continue
        k, _, v = line.partition(":")
        k = k.strip()
        if k == "Sleep Score":
            cur.score = _int(v)
        elif k == "Daily Sleep":
            cur.daily_sleep_s = parse_hms(v)
        elif k == "Main Sleep (asleep)":
            cur.main_asleep_s = parse_hms(v)
        elif k == "Main Sleep Period (incl. awake)":
            cur.main_period_s = parse_hms(v)
        elif k == "Deep Sleep Ratio":
            cur.deep_pct = _int(v)
        elif k == "Light Sleep Ratio":
            cur.light_pct = _int(v)
        elif k == "REM Ratio":
            cur.rem_pct = _int(v)
        elif k == "Awake Ratio":
            cur.awake_pct = _int(v)
        elif k == "Awake Time":
            cur.awake_s = parse_hms(v)
        elif k == "Awake Count (>5 min)":
            cur.awake_count = _int(v)
        elif k == "Main Sleep Window":
            m = _WINDOW_RE.search(v)
            if m:
                cur.window_start = datetime.strptime(m.group(1), "%Y-%m-%d %H:%M")
                cur.window_end = datetime.strptime(m.group(2), "%Y-%m-%d %H:%M")
        elif k == "Naps Total":
            cur.naps_s = parse_hms(v)
    return out


# --------------------------------------------------------------------------- sleep HRV


@dataclass
class HrvAssessment:
    date: date
    avg_ms: int | None
    status: str | None
    normal_low: int | None
    normal_high: int | None
    baseline: int | None


@dataclass
class HrvPoint:
    date: date
    ts: int
    hrv_ms: int
    status: int | None
    confidence: int | None


@dataclass
class SleepHrvReport:
    assessments: list[HrvAssessment] = field(default_factory=list)
    points: list[HrvPoint] = field(default_factory=list)


_HRV_POINT_RE = re.compile(
    r"timestamp=(\d+).*?hrv=(\d+)\s*ms(?:.*?status=(\d+))?(?:.*?confidence=(\d+))?"
)


def parse_sleep_hrv(text: str) -> SleepHrvReport:
    rep = SleepHrvReport()
    section = None
    cur_date: date | None = None
    pending: HrvAssessment | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith("HRV Assessment"):
            section = "assess"
            continue
        if line.startswith("Sleep HRV Time Series"):
            section = "series"
            continue
        m = re.match(r"^(\d{4}-\d{2}-\d{2}):\s*$", line)
        if m:
            cur_date = _d(m.group(1))
            if section == "assess":
                pending = HrvAssessment(cur_date, None, None, None, None, None)
                rep.assessments.append(pending)
            continue
        if section == "assess" and pending is not None:
            if line.startswith("HRV Avg:"):
                pending.avg_ms = _int(line)
                dash = line.split("—")
                pending.status = dash[1].strip() if len(dash) > 1 else None
            elif line.startswith("Normal Range:"):
                nums = re.findall(r"\d+", line)
                if len(nums) >= 2:
                    pending.normal_low, pending.normal_high = int(nums[0]), int(nums[1])
            elif line.startswith("Baseline:"):
                pending.baseline = _int(line)
        elif section == "series" and cur_date is not None and line.startswith("timestamp="):
            m2 = _HRV_POINT_RE.search(line)
            if m2:
                rep.points.append(
                    HrvPoint(
                        cur_date,
                        int(m2.group(1)),
                        int(m2.group(2)),
                        int(m2.group(3)) if m2.group(3) else None,
                        int(m2.group(4)) if m2.group(4) else None,
                    )
                )
    return rep


# --------------------------------------------------------------------------- stress series


@dataclass
class StressPoint:
    ts: int
    stress: int
    score: int | None
    stress_hrv: int | None
    stress_hr: int | None


_STRESS_POINT_RE = re.compile(
    r"timestamp=(\d+).*?stress=(\d+)(?:.*?score=(\d+))?(?:.*?stressHrv=(\d+))?(?:.*?stressHr=(\d+))?"
)


def parse_stress_series(text: str) -> list[StressPoint]:
    out = []
    for line in text.splitlines():
        m = _STRESS_POINT_RE.search(line)
        if m:
            g = m.groups()
            out.append(
                StressPoint(
                    int(g[0]),
                    int(g[1]),
                    int(g[2]) if g[2] else None,
                    int(g[3]) if g[3] else None,
                    int(g[4]) if g[4] else None,
                )
            )
    return out


# --------------------------------------------------------------------------- training load


@dataclass
class LoadDay:
    date: date
    comment: str | None
    stl: float | None
    ltl: float | None
    ratio: float | None


def parse_training_load(text: str) -> list[LoadDay]:
    out: list[LoadDay] = []
    cur: LoadDay | None = None
    for raw in text.splitlines():
        line = raw.strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", line):
            cur = LoadDay(_d(line), None, None, None, None)
            out.append(cur)
            continue
        if cur is None:
            continue
        if line.startswith("Comment:"):
            cur.comment = line.split(":", 1)[1].strip()
        elif line.startswith("Short-Term Load:"):
            cur.stl = _float(line)
        elif line.startswith("Long-Term Load:"):
            cur.ltl = _float(line)
        elif line.startswith("Load Ratio:"):
            cur.ratio = _float(line)
    return out


# --------------------------------------------------------------------------- singletons


def parse_recovery_status(text: str) -> dict[str, Any]:
    pct = re.search(r"Recovery:\s*(\d+)%", text)
    level = re.search(r"Level:\s*(.+)", text)
    hours = re.search(r"Estimated Full Recovery:\s*(.+)", text)
    return {
        "recovery_pct": int(pct.group(1)) if pct else None,
        "level": level.group(1).strip() if level else None,
        "full_recovery_s": parse_hms(hours.group(1)) if hours else None,
    }


def parse_fitness_assessment(text: str) -> dict[str, Any]:
    def grab(label: str) -> str | None:
        m = re.search(rf"{re.escape(label)}:\s*(.+)", text)
        return m.group(1).strip() if m else None

    return {
        "vo2max": _float(grab("VO2max")),
        "running_level": _float(grab("Running Level")),
        "threshold_pace_s_per_km": parse_pace(grab("Threshold Pace")),
        "pred_5k_s": parse_hms(grab("5 km Prediction")),
        "pred_10k_s": parse_hms(grab("10 km Prediction")),
        "pred_half_s": parse_hms(grab("Half Marathon Prediction")),
        "pred_marathon_s": parse_hms(grab("Marathon Prediction")),
    }


def parse_user_info(text: str) -> dict[str, Any]:
    def grab(label: str) -> str | None:
        m = re.search(rf"{re.escape(label)}:\s*(.+)", text)
        return m.group(1).strip() if m else None

    bday = grab("Birthday")
    return {
        "height_cm": _float(grab("Height")),
        "weight_kg": _float(grab("Weight")),
        "dob": _d(bday) if bday and _DATE_RE.search(bday) else None,
        "sex": (grab("Gender") or "").lower() or None,
        "nickname": grab("Nickname"),
    }


def parse_activity_detail(text: str) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for raw in text.splitlines():
        if ":" not in raw:
            continue
        k, _, v = raw.strip().partition(":")
        k, v = k.strip(), v.strip()
        if k == "Training Load":
            out["training_load"] = _float(v)
        elif k == "Aerobic TE":
            out["aerobic_te"] = _float(v)
        elif k == "Anaerobic TE":
            out["anaerobic_te"] = _float(v)
        elif k == "Average Power":
            out["avg_power_w"] = _float(v)
        elif k == "Average Cadence":
            out["avg_cadence"] = _int(v)
        elif k == "Elevation Gain / Loss":
            nums = re.findall(r"\d+", v)
            if nums:
                out["elev_gain_m"] = float(nums[0])
        elif k == "Training Focus":
            out["training_focus"] = v
        elif k == "Performance":
            out["performance"] = v
    return out


def parse_lap_data(payload: str | dict) -> list[dict[str, Any]]:
    """Lap data is the one tool that returns JSON. Flattens lapGroups into a lap list."""
    data = json.loads(payload) if isinstance(payload, str) else payload
    laps: list[dict[str, Any]] = []
    for group in data.get("lapGroups", []):
        gtype = group.get("type")
        for lap in group.get("laps", []):
            laps.append({"group_type": gtype, **lap})
    return laps


# ---------------------------------------------------------------- strength laps


@dataclass
class StrengthLapSet:
    exercise: str
    offset_s: float  # seconds from activity start
    reps: int | None
    weight_kg: float | None
    is_bodyweight: bool
    duration_s: float | None
    avg_hr: int | None


def parse_strength_laps(
    laps: list[dict[str, Any]], body_weight_kg: float | None = None
) -> list[StrengthLapSet]:
    """Working sets from a COROS strength activity's lap data (the output of parse_lap_data).

    COROS strength laps look like this:
    - one lap per set or rest, with `exerciseNameKey`, `reps`, `time` (s), `totalLength`
      (s since start) and `weight` in grams;
    - per-exercise summary rows with `sets` > 0 (total sets, total reps, weight = volume);
    - rest laps, and sets with no load entered, carry a default weight: the body weight from
      the COROS profile. A set is treated as bodyweight (no lifted load) when its weight is 0,
      is within 1 kg of `body_weight_kg`, equals the weight every rest lap carries, or equals
      the one weight every lap carries.

    When a summary says an exercise had more sets than there are laps with reps, the missing
    sets are added with unknown reps so the set count matches what the watch shows.
    """
    work = [
        lap
        for lap in laps
        if not lap.get("sets")
        and (lap.get("reps") or 0) > 0
        and lap.get("exerciseNameKey") != "Rest"
    ]
    plain = [lap for lap in laps if not lap.get("sets")]
    weights = {lap.get("weight") or 0 for lap in plain}
    rest_weights = {lap.get("weight") or 0 for lap in plain if lap.get("exerciseNameKey") == "Rest"}
    defaults = set()
    if len(weights) == 1:
        defaults |= weights
    if len(rest_weights) == 1:
        defaults |= rest_weights
    defaults.discard(0)
    summary_sets: dict[str, int] = {}
    for lap in laps:
        name = lap.get("exerciseNameKey") or "Unknown"
        if lap.get("sets") and name != "Rest":
            summary_sets[name] = max(summary_sets.get(name, 0), int(lap["sets"]))

    out: list[StrengthLapSet] = []
    for lap in work:
        grams = lap.get("weight") or 0
        bodyweight = (
            grams == 0
            or grams in defaults
            or (body_weight_kg is not None and abs(grams / 1000 - body_weight_kg) <= 1.0)
        )
        time = lap.get("time")
        out.append(
            StrengthLapSet(
                exercise=lap.get("exerciseNameKey") or "Unknown",
                offset_s=float((lap.get("totalLength") or 0) - (time or 0)),
                reps=int(lap["reps"]),
                weight_kg=None if bodyweight else round(grams / 1000, 2),
                is_bodyweight=bodyweight,
                duration_s=float(time) if time is not None else None,
                avg_hr=lap.get("avgHr"),
            )
        )
    for name, n in summary_sets.items():
        have = [x for x in out if x.exercise == name]
        last = max((x.offset_s for x in have), default=0.0)
        for _ in range(n - len(have)):
            out.append(StrengthLapSet(name, last, None, None, False, None, None))
    out.sort(key=lambda x: x.offset_s)
    return out
