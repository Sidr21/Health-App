"""FIT activity files -> per-second samples (DESIGN §3.1, phase 1).

The parser is pure (bytes in, samples out). `store_fit` replaces an activity's samples and
keeps the original file under data/raw/fit/ so we never have to download it twice
(COROS limits daily FIT downloads).
"""

from __future__ import annotations

import io
import warnings
from dataclasses import dataclass, field
from datetime import UTC, datetime

import fitdecode
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from health.config import settings
from health.models import Activity, ActivityLap, ActivitySample

_SEMI = 180 / 2**31
# FIT stores foot-sport cadence per leg (strides/min); apps show steps/min, i.e. double.
_STRIDE_SPORTS = {"running", "walking", "hiking", "training"}


@dataclass
class FitParsed:
    start: datetime | None  # naive UTC
    samples: list[dict] = field(default_factory=list)
    sport: str | None = None
    laps: list[dict] = field(default_factory=list)
    session: dict = field(default_factory=dict)


def _f(frame, *names):
    for n in names:
        if frame.has_field(n):
            v = frame.get_value(n)
            if v is not None:
                return v
    return None


def _naive(ts) -> datetime | None:
    return ts.astimezone(UTC).replace(tzinfo=None) if isinstance(ts, datetime) else None


def parse_fit(data: bytes) -> FitParsed:
    start: datetime | None = None
    records: list[tuple[datetime, dict]] = []
    laps: list[dict] = []
    session: dict = {}
    sport: str | None = None
    with warnings.catch_warnings():
        # some COROS files carry a malformed definition for an unused field; fitdecode warns
        warnings.simplefilter("ignore", UserWarning)
        with fitdecode.FitReader(io.BytesIO(data)) as fit:
            for frame in fit:
                if not isinstance(frame, fitdecode.FitDataMessage):
                    continue
                if frame.name in ("sport", "session") and sport is None:
                    v = _f(frame, "sport")
                    sport = str(v) if v is not None else None
                if frame.name == "session" and not session:
                    session = {
                        "elapsed_s": _f(frame, "total_elapsed_time"),
                        "timer_s": _f(frame, "total_timer_time"),
                        "distance_m": _f(frame, "total_distance"),
                        "avg_hr": _f(frame, "avg_heart_rate"),
                        "max_hr": _f(frame, "max_heart_rate"),
                        "avg_power_w": _f(frame, "avg_power"),
                        "ascent_m": _f(frame, "total_ascent"),
                        "descent_m": _f(frame, "total_descent"),
                        "avg_cadence": _f(frame, "avg_running_cadence", "avg_cadence"),
                        "step_length_m": (_f(frame, "avg_step_length") or 0) / 1000 or None,
                        "calories": _f(frame, "total_calories"),
                    }
                elif frame.name == "lap":
                    laps.append(
                        {
                            "start": _naive(_f(frame, "start_time")),
                            "timer_s": _f(frame, "total_timer_time"),
                            "distance_m": _f(frame, "total_distance"),
                            "avg_hr": _f(frame, "avg_heart_rate"),
                            "max_hr": _f(frame, "max_heart_rate"),
                            "avg_speed": _f(frame, "enhanced_avg_speed", "avg_speed"),
                            "avg_power_w": _f(frame, "avg_power"),
                            "avg_cadence": _f(frame, "avg_running_cadence", "avg_cadence"),
                        }
                    )
                elif frame.name == "record":
                    ts = _naive(_f(frame, "timestamp"))
                    if ts is None:
                        continue
                    if start is None:
                        start = ts
                    lat, lon = _f(frame, "position_lat"), _f(frame, "position_long")
                    hr = _f(frame, "heart_rate")
                    cad = _f(frame, "cadence")
                    frac = _f(frame, "fractional_cadence") or 0
                    records.append(
                        (
                            ts,
                            {
                                "hr": int(hr) if hr and hr < 255 else None,
                                "speed_mps": _f(frame, "enhanced_speed", "speed"),
                                "distance_m": _f(frame, "distance"),
                                "cadence": cad + frac if cad is not None else None,
                                "power_w": _f(frame, "power"),
                                "alt_m": _f(frame, "enhanced_altitude", "altitude"),
                                "lat": lat * _SEMI if isinstance(lat, int) else None,
                                "lon": lon * _SEMI if isinstance(lon, int) else None,
                            },
                        )
                    )
    double = (sport or "").lower() in _STRIDE_SPORTS
    out = []
    for ts, rec in records:
        if double and rec["cadence"] is not None:
            rec["cadence"] = rec["cadence"] * 2
        if rec["cadence"] is not None:
            rec["cadence"] = int(round(rec["cadence"]))
        out.append({"t_offset_s": int((ts - start).total_seconds()), **rec})
    if double:
        for lap in laps:
            if lap["avg_cadence"] is not None:
                lap["avg_cadence"] *= 2
        if session.get("avg_cadence") is not None:
            session["avg_cadence"] *= 2
    return FitParsed(start, out, sport, laps, session)


def store_fit(s: Session, activity: Activity, data: bytes) -> int:
    """Replace the activity's samples with the file's stream. Laps from the file are used only
    when COROS sent none; the session summary fills stats the activity record lacks."""
    parsed = parse_fit(data)
    path = settings.raw_dir / "fit" / f"{activity.source}_{activity.external_id}.fit"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    activity.fit_path = str(path)
    s.execute(delete(ActivitySample).where(ActivitySample.activity_id == activity.id))
    for x in parsed.samples:
        s.add(ActivitySample(activity_id=activity.id, **x))
    sess = parsed.session
    hrs = [x["hr"] for x in parsed.samples if x["hr"]]
    activity.max_hr = (
        max(activity.max_hr or 0, sess.get("max_hr") or 0, max(hrs, default=0)) or None
    )
    activity.avg_power_w = activity.avg_power_w or sess.get("avg_power_w")
    activity.elev_gain_m = (
        activity.elev_gain_m if activity.elev_gain_m is not None else sess.get("ascent_m")
    )
    raw = dict(activity.raw_json or {})
    raw["fit_session"] = {k: v for k, v in sess.items() if v is not None}
    raw["fit_session"]["sport"] = parsed.sport
    activity.raw_json = raw

    has_laps = s.execute(
        select(ActivityLap.id).where(ActivityLap.activity_id == activity.id).limit(1)
    ).first()
    if not has_laps and parsed.start is not None:
        for i, lap in enumerate(parsed.laps, start=1):
            speed = lap["avg_speed"]
            s.add(
                ActivityLap(
                    activity_id=activity.id,
                    idx=i,
                    start_offset_s=(lap["start"] - parsed.start).total_seconds()
                    if lap["start"]
                    else None,
                    duration_s=lap["timer_s"],
                    distance_m=lap["distance_m"],
                    avg_hr=lap["avg_hr"],
                    max_hr=lap["max_hr"],
                    avg_pace_s_per_km=1000 / speed if speed else None,
                    avg_power_w=lap["avg_power_w"],
                    avg_cadence=int(lap["avg_cadence"]) if lap["avg_cadence"] else None,
                    raw_json={"source": "fit"},
                )
            )
    s.flush()
    return len(parsed.samples)
