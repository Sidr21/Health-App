"""Parse lifting-app CSV exports into sets. Pure: text in, `ParsedSet`s out.

Supported:
- **Strong** (Settings → Export data). Comma or semicolon separated. Columns include
  `Date, Workout Name, Exercise Name, Set Order, Weight, Reps, Seconds, RPE`; newer exports add
  `Weight Unit`. `Set Order` is a number, or W (warm-up), D (drop set), F (failure); "Rest Timer"
  rows are skipped. Older exports carry no unit, so the caller says whether weights are lb or kg.
- **Hevy** (Settings → Export & import data → Export workouts). Columns include
  `title, start_time, exercise_title, set_index, set_type, weight_lbs|weight_kg, reps,
  duration_seconds, rpe`.

Times in both files are local wall-clock times; they are converted to naive UTC with `tz`.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

LB = 0.45359237


@dataclass
class ParsedSet:
    session_key: str
    ts: datetime  # naive UTC
    day: date  # local calendar day
    workout_name: str | None
    exercise: str
    set_idx: int
    set_type: str  # normal|warmup|dropset|failure
    reps: int | None
    weight_kg: float | None
    is_bodyweight: bool
    duration_s: float | None = None
    rpe: float | None = None
    avg_hr: int | None = None


def _num(v: str | None) -> float | None:
    if v is None:
        return None
    v = v.strip().replace(",", ".") if v.count(",") == 1 and "." not in v else v.strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def _parse_time(v: str) -> datetime:
    v = v.strip()
    for fmt in (
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%d %b %Y, %H:%M",
        "%d %b %Y %H:%M",
        "%b %d, %Y, %I:%M %p",
    ):
        try:
            return datetime.strptime(v, fmt)
        except ValueError:
            continue
    return datetime.fromisoformat(v)


def _to_utc(local: datetime, tz: str) -> tuple[datetime, date]:
    if local.tzinfo is None:
        local = local.replace(tzinfo=ZoneInfo(tz))
    return local.astimezone(UTC).replace(tzinfo=None), local.astimezone(ZoneInfo(tz)).date()


def _rows(text: str) -> list[dict[str, str]]:
    text = text.lstrip("﻿")
    first = text.splitlines()[0] if text else ""
    delim = ";" if first.count(";") > first.count(",") else ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delim)
    return [{(k or "").strip(): (v or "").strip() for k, v in row.items()} for row in reader]


def detect(text: str) -> str | None:
    header = text.lstrip("﻿").splitlines()[0].lower() if text.strip() else ""
    if "exercise_title" in header and "start_time" in header:
        return "hevy"
    if "exercise name" in header and "set order" in header:
        return "strong"
    return None


def _make(
    key: str,
    when: datetime,
    tz: str,
    name: str | None,
    exercise: str,
    idx: int,
    set_type: str,
    reps: float | None,
    weight_kg: float | None,
    seconds: float | None,
    rpe: float | None,
) -> ParsedSet:
    ts, day = _to_utc(when, tz)
    reps_i = int(reps) if reps else None
    loaded = weight_kg is not None and weight_kg > 0
    return ParsedSet(
        session_key=key,
        ts=ts,
        day=day,
        workout_name=name or None,
        exercise=exercise,
        set_idx=idx,
        set_type=set_type,
        reps=reps_i,
        weight_kg=round(weight_kg, 2) if loaded and weight_kg is not None else None,
        is_bodyweight=not loaded and reps_i is not None,
        duration_s=seconds or None,
        rpe=rpe,
    )


def parse_strong(text: str, *, unit: str = "lb", tz: str = "UTC") -> list[ParsedSet]:
    out: list[ParsedSet] = []
    counters: dict[str, int] = {}
    for row in _rows(text):
        order = row.get("Set Order", "")
        if not row.get("Exercise Name") or order.lower().startswith("rest"):
            continue
        set_type = {"w": "warmup", "d": "dropset", "f": "failure"}.get(order.lower(), "normal")
        when = _parse_time(row["Date"])
        key = f"{when.isoformat()}|{row.get('Workout Name', '')}"[:80]
        row_unit = (row.get("Weight Unit") or unit).lower()
        w = _num(row.get("Weight"))
        weight_kg = w * LB if (w is not None and row_unit.startswith("lb")) else w
        idx = counters.get(key, 0)
        counters[key] = idx + 1
        out.append(
            _make(
                key,
                when,
                tz,
                row.get("Workout Name"),
                row["Exercise Name"],
                idx,
                set_type,
                _num(row.get("Reps")),
                weight_kg,
                _num(row.get("Seconds")),
                _num(row.get("RPE")),
            )
        )
    return out


def parse_hevy(text: str, *, tz: str = "UTC") -> list[ParsedSet]:
    out: list[ParsedSet] = []
    counters: dict[str, int] = {}
    for row in _rows(text):
        if not row.get("exercise_title"):
            continue
        when = _parse_time(row["start_time"])
        key = f"{when.isoformat()}|{row.get('title', '')}"[:80]
        if row.get("weight_kg") not in (None, ""):
            weight_kg = _num(row.get("weight_kg"))
        else:
            lbs = _num(row.get("weight_lbs"))
            weight_kg = lbs * LB if lbs is not None else None
        st = (row.get("set_type") or "normal").lower()
        set_type = st if st in ("warmup", "dropset", "failure") else "normal"
        idx = counters.get(key, 0)
        counters[key] = idx + 1
        out.append(
            _make(
                key,
                when,
                tz,
                row.get("title"),
                row["exercise_title"],
                idx,
                set_type,
                _num(row.get("reps")),
                weight_kg,
                _num(row.get("duration_seconds")),
                _num(row.get("rpe")),
            )
        )
    return out


def parse_csv(text: str, *, unit: str = "lb", tz: str = "UTC") -> tuple[str, list[ParsedSet]]:
    """Detect the app from the header and parse. Returns (source, sets)."""
    kind = detect(text)
    if kind == "hevy":
        return "hevy", parse_hevy(text, tz=tz)
    if kind == "strong":
        return "strong", parse_strong(text, unit=unit, tz=tz)
    raise ValueError("not a Strong or Hevy export (header not recognised)")
