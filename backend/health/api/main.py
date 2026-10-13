from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import Body, Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from health import __version__
from health.api.auth import require_token
from health.compute import strength_summary
from health.config import settings
from health.db import get_session, init_db
from health.engine.muscles import MUSCLES, catalog
from health.models import (
    Activity,
    BodyMetric,
    Daily,
    Score,
    SleepSession,
    StrengthSet,
    StressSample,
    SyncLog,
)
from health.sources.apple_health import HKPayload, ingest
from health.sources.strength_csv import LB, ParsedSet, parse_csv
from health.sources.strength_store import replace_sessions


@asynccontextmanager
async def _lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Health App API", version=__version__, lifespan=_lifespan)
# The native app does not need CORS; the Expo web preview does. Auth is the bearer token.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/health")
def health() -> dict:
    return {"ok": True, "version": __version__}


def _scores_for(s: Session, d: date) -> dict:
    rows = s.execute(select(Score).where(Score.date == d)).scalars()
    return {r.kind: {"value": r.value, "components": r.components} for r in rows}


def day_bounds_utc(d: date, tz: str | None = None) -> tuple[datetime, datetime]:
    """Local calendar day -> naive UTC [start, end). Samples and activities are stored in UTC."""
    zone = ZoneInfo(tz or settings.timezone)
    start = datetime.combine(d, datetime.min.time(), tzinfo=zone)
    end = start + timedelta(days=1)
    return (
        start.astimezone(UTC).replace(tzinfo=None),
        end.astimezone(UTC).replace(tzinfo=None),
    )


def _day_payload(s: Session, d: date) -> dict:
    daily = s.get(Daily, d)
    sleep = s.execute(
        select(SleepSession).where(SleepSession.date == d, SleepSession.is_nap.is_(False))
    ).scalar_one_or_none()
    lo, hi = day_bounds_utc(d)
    acts = s.execute(
        select(Activity)
        .where(Activity.start_ts >= lo, Activity.start_ts < hi)
        .order_by(Activity.start_ts)
    ).scalars()
    stress_lo, stress_hi, stress_last = s.execute(
        select(
            func.min(StressSample.stress), func.max(StressSample.stress), func.max(StressSample.ts)
        ).where(StressSample.ts >= lo, StressSample.ts < hi)
    ).one()
    return {
        "date": d.isoformat(),
        "scores": _scores_for(s, d),
        "daily": {
            "steps": daily.steps if daily else None,
            "calories": daily.calories if daily else None,
            "rhr": daily.rhr if daily else None,
            "stress_avg": daily.stress_avg if daily else None,
            "stress_min": stress_lo,
            "stress_max": stress_hi,
            "stress_updated": (
                stress_last.replace(tzinfo=UTC).isoformat() if stress_last else None
            ),
            "coros_recovery_pct": daily.coros_recovery_pct if daily else None,
            "coros_stl": daily.coros_stl if daily else None,
            "coros_ltl": daily.coros_ltl if daily else None,
            "coros_load_ratio": daily.coros_load_ratio if daily else None,
            "coros_load_comment": daily.coros_load_comment if daily else None,
        },
        "sleep": (
            {
                "start": sleep.start_ts.isoformat() if sleep.start_ts else None,
                "end": sleep.end_ts.isoformat() if sleep.end_ts else None,
                "asleep_s": sleep.asleep_s,
                "in_bed_s": sleep.in_bed_s,
                "deep_s": sleep.deep_s,
                "light_s": sleep.light_s,
                "rem_s": sleep.rem_s,
                "awake_s": sleep.awake_s,
                "awake_count": sleep.awake_count,
                "hr_avg": sleep.hr_avg,
                "hr_min": sleep.hr_min,
                "coros_score": sleep.coros_score,
            }
            if sleep
            else None
        ),
        "activities": [
            {
                "id": a.id,
                "sport": a.sport,
                "sport_code": a.sport_code,
                "start": a.start_ts.replace(tzinfo=UTC).isoformat(),
                "duration_s": a.duration_s,
                "distance_m": a.distance_m,
                "avg_hr": a.avg_hr,
                "calories": a.calories,
                "coros_training_load": a.coros_training_load,
            }
            for a in acts
        ],
    }


@app.get("/today", dependencies=[Depends(require_token)])
def today(s: Session = Depends(get_session)) -> dict:
    return _day_payload(s, date.today())


@app.get("/days", dependencies=[Depends(require_token)])
def days(
    start: date = Query(...),
    end: date = Query(...),
    s: Session = Depends(get_session),
) -> list[dict]:
    out = []
    d = start
    while d <= end:
        out.append(_day_payload(s, d))
        d += timedelta(days=1)
    return out


@app.get("/activities", dependencies=[Depends(require_token)])
def activities(limit: int = 50, s: Session = Depends(get_session)) -> list[dict]:
    rows = s.execute(select(Activity).order_by(Activity.start_ts.desc()).limit(limit)).scalars()
    return [
        {
            "id": a.id,
            "sport": a.sport,
            "sport_code": a.sport_code,
            "start": a.start_ts.replace(tzinfo=UTC).isoformat(),
            "duration_s": a.duration_s,
            "distance_m": a.distance_m,
            "avg_hr": a.avg_hr,
            "max_hr": a.max_hr,
            "avg_pace_s_per_km": a.avg_pace_s_per_km,
            "calories": a.calories,
            "location": a.location,
            "coros_training_load": a.coros_training_load,
            "coros_aerobic_te": a.coros_aerobic_te,
            "coros_anaerobic_te": a.coros_anaerobic_te,
        }
        for a in rows
    ]


@app.get("/body", dependencies=[Depends(require_token)])
def body(metric: str | None = None, limit: int = 200, s: Session = Depends(get_session)) -> list:
    q = select(BodyMetric).order_by(BodyMetric.ts.desc()).limit(limit)
    if metric:
        q = q.where(BodyMetric.metric == metric)
    return [
        {
            "ts": r.ts.isoformat(),
            "metric": r.metric,
            "value": r.value,
            "unit": r.unit,
            "source": r.source,
        }
        for r in s.execute(q).scalars()
    ]


@app.post("/ingest/apple-health", dependencies=[Depends(require_token)])
def ingest_apple_health(payload: HKPayload, s: Session = Depends(get_session)) -> dict:
    return ingest(s, payload)


@app.get("/sync/status", dependencies=[Depends(require_token)])
def sync_status(s: Session = Depends(get_session)) -> list[dict]:
    rows = s.execute(select(SyncLog).order_by(SyncLog.ts.desc()).limit(30)).scalars()
    return [
        {"ts": r.ts.isoformat(), "source": r.source, "kind": r.kind, "ok": r.ok, "detail": r.detail}
        for r in rows
    ]


# ---------------------------------------------------------------- strength


@app.get("/strength", dependencies=[Depends(require_token)])
def strength(
    day: date | None = Query(None, alias="date"), s: Session = Depends(get_session)
) -> dict:
    """Muscle freshness, muscular load, 7-day sets/volume and recent sessions for a day."""
    return strength_summary(s, day or datetime.now(ZoneInfo(settings.timezone)).date())


@app.get("/strength/exercises", dependencies=[Depends(require_token)])
def strength_exercises() -> dict:
    return {
        "exercises": catalog(),
        "muscles": [{"id": m.id, "name": m.name, "views": list(m.views)} for m in MUSCLES.values()],
    }


class SetIn(BaseModel):
    exercise: str = Field(min_length=1, max_length=120)
    reps: int | None = Field(None, ge=0, le=1000)
    weight: float | None = Field(None, ge=0, le=1000)
    set_type: Literal["normal", "warmup", "dropset", "failure"] = "normal"
    duration_s: float | None = Field(None, ge=0)


class SessionIn(BaseModel):
    started_at: datetime | None = None  # naive = local wall-clock time
    name: str | None = Field(None, max_length=120)
    unit: Literal["lb", "kg"] = "lb"
    session_key: str | None = Field(None, max_length=60)
    sets: list[SetIn] = Field(min_length=1, max_length=200)


@app.post("/strength/sessions", dependencies=[Depends(require_token)])
def log_strength_session(body: SessionIn, s: Session = Depends(get_session)) -> dict:
    """Log (or replace, when `session_key` is reused) a lifting session from the app."""
    zone = ZoneInfo(settings.timezone)
    start = body.started_at or datetime.now(zone)
    if start.tzinfo is None:
        start = start.replace(tzinfo=zone)
    key = body.session_key or f"manual-{uuid.uuid4().hex[:12]}"
    factor = LB if body.unit == "lb" else 1.0
    sets = []
    for i, x in enumerate(body.sets):
        ts = start + timedelta(seconds=i)
        loaded = x.weight is not None and x.weight > 0
        sets.append(
            ParsedSet(
                session_key=key,
                ts=ts.astimezone(UTC).replace(tzinfo=None),
                day=ts.astimezone(zone).date(),
                workout_name=body.name,
                exercise=x.exercise.strip(),
                set_idx=i,
                set_type=x.set_type,
                reps=x.reps or None,
                weight_kg=round(x.weight * factor, 2) if loaded and x.weight else None,
                is_bodyweight=not loaded and bool(x.reps),
                duration_s=x.duration_s,
            )
        )
    n = replace_sessions(s, "manual", sets)
    return {"session_key": key, "sets": n}


@app.delete("/strength/sessions/{session_key}", dependencies=[Depends(require_token)])
def delete_strength_session(
    session_key: str, source: str = "manual", s: Session = Depends(get_session)
) -> dict:
    res = s.execute(
        delete(StrengthSet).where(
            StrengthSet.source == source, StrengthSet.session_key == session_key
        )
    )
    if not res.rowcount:
        raise HTTPException(404, "no such session")
    return {"deleted": res.rowcount}


@app.post("/import/strength-csv", dependencies=[Depends(require_token)])
def import_strength_csv(
    text: str = Body(..., media_type="text/csv"),
    unit: Literal["lb", "kg"] = "lb",
    s: Session = Depends(get_session),
) -> dict:
    """Upload a Strong or Hevy CSV export. Re-uploading replaces the same sessions."""
    try:
        source, sets = parse_csv(text, unit=unit, tz=settings.timezone)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    replace_sessions(s, source, sets)
    return {"source": source, "sets": len(sets), "sessions": len({x.session_key for x in sets})}
