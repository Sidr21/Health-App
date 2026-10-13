"""FIT activity files -> per-second samples (DESIGN §3.1, phase 1).

The parser is pure (bytes in, samples out). `store_fit` replaces an activity's samples and
keeps the original file under data/raw/fit/ so we never have to download it twice
(COROS limits daily FIT downloads).
"""

from __future__ import annotations

import io
from dataclasses import dataclass, field
from datetime import UTC, datetime

import fitdecode
from sqlalchemy import delete
from sqlalchemy.orm import Session

from health.config import settings
from health.models import Activity, ActivitySample

_SEMI = 180 / 2**31


@dataclass
class FitParsed:
    start: datetime | None  # naive UTC
    samples: list[dict] = field(default_factory=list)


def _f(frame, *names):
    for n in names:
        if frame.has_field(n):
            v = frame.get_value(n)
            if v is not None:
                return v
    return None


def parse_fit(data: bytes) -> FitParsed:
    start: datetime | None = None
    out: list[dict] = []
    with fitdecode.FitReader(io.BytesIO(data)) as fit:
        for frame in fit:
            if not isinstance(frame, fitdecode.FitDataMessage) or frame.name != "record":
                continue
            ts = _f(frame, "timestamp")
            if not isinstance(ts, datetime):
                continue
            ts = ts.astimezone(UTC).replace(tzinfo=None)
            if start is None:
                start = ts
            lat, lon = _f(frame, "position_lat"), _f(frame, "position_long")
            hr = _f(frame, "heart_rate")
            out.append(
                {
                    "t_offset_s": int((ts - start).total_seconds()),
                    "hr": int(hr) if hr and hr < 255 else None,
                    "speed_mps": _f(frame, "enhanced_speed", "speed"),
                    "distance_m": _f(frame, "distance"),
                    "cadence": _f(frame, "cadence"),
                    "power_w": _f(frame, "power"),
                    "alt_m": _f(frame, "enhanced_altitude", "altitude"),
                    "lat": lat * _SEMI if isinstance(lat, int) else None,
                    "lon": lon * _SEMI if isinstance(lon, int) else None,
                }
            )
    return FitParsed(start, out)


def store_fit(s: Session, activity: Activity, data: bytes) -> int:
    parsed = parse_fit(data)
    path = settings.raw_dir / "fit" / f"{activity.source}_{activity.external_id}.fit"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    activity.fit_path = str(path)
    s.execute(delete(ActivitySample).where(ActivitySample.activity_id == activity.id))
    for x in parsed.samples:
        s.add(ActivitySample(activity_id=activity.id, **{k: v for k, v in x.items()}))
    hrs = [x["hr"] for x in parsed.samples if x["hr"]]
    if hrs:
        activity.max_hr = max(activity.max_hr or 0, max(hrs))
    s.flush()
    return len(parsed.samples)
