"""Persist strength sets from any source. Re-importing a session replaces it (idempotent)."""

from __future__ import annotations

from collections import defaultdict
from datetime import timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from health.config import settings
from health.models import Activity, BodyMetric, StrengthSet
from health.sources.coros.parsers import parse_strength_laps
from health.sources.strength_csv import ParsedSet

STRENGTH_SPORT_CODES = {402}


def is_strength(activity: Activity) -> bool:
    return (
        activity.sport_code in STRENGTH_SPORT_CODES or "strength" in (activity.sport or "").lower()
    )


def latest_body_weight(s: Session) -> float | None:
    row = s.execute(
        select(BodyMetric)
        .where(BodyMetric.metric == "weight_kg")
        .order_by(BodyMetric.ts.desc())
        .limit(1)
    ).scalar_one_or_none()
    return row.value if row else None


def replace_sessions(
    s: Session, source: str, sets: list[ParsedSet], *, activity_id: int | None = None
) -> int:
    """Insert `sets`, first deleting any stored sets of the same (source, session)."""
    by_session: dict[str, list[ParsedSet]] = defaultdict(list)
    for x in sets:
        by_session[x.session_key].append(x)
    for key, rows in by_session.items():
        s.execute(
            delete(StrengthSet).where(StrengthSet.source == source, StrengthSet.session_key == key)
        )
        for x in rows:
            s.add(
                StrengthSet(
                    source=source,
                    session_key=key,
                    activity_id=activity_id,
                    ts=x.ts,
                    date=x.day,
                    workout_name=x.workout_name,
                    exercise=x.exercise,
                    set_idx=x.set_idx,
                    set_type=x.set_type,
                    reps=x.reps,
                    weight_kg=x.weight_kg,
                    is_bodyweight=x.is_bodyweight,
                    duration_s=x.duration_s,
                    rpe=x.rpe,
                    avg_hr=x.avg_hr,
                )
            )
    s.flush()
    return len(sets)


def store_coros_strength(s: Session, activity: Activity, laps: list[dict]) -> int:
    """Turn a COROS strength activity's laps into sets, keyed on the activity's labelId."""
    tz = ZoneInfo(settings.timezone)
    parsed = parse_strength_laps(laps, body_weight_kg=latest_body_weight(s))
    start = activity.start_ts
    sets: list[ParsedSet] = []
    for i, x in enumerate(parsed):
        ts = start + timedelta(seconds=x.offset_s)
        local_day = ts.replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).date()
        sets.append(
            ParsedSet(
                session_key=activity.external_id,
                ts=ts,
                day=local_day,
                workout_name=activity.location or activity.sport,
                exercise=x.exercise,
                set_idx=i,
                set_type="normal",
                reps=x.reps,
                weight_kg=x.weight_kg,
                is_bodyweight=x.is_bodyweight,
                duration_s=x.duration_s,
                avg_hr=x.avg_hr,
            )
        )
    return replace_sessions(s, "coros", sets, activity_id=activity.id)
