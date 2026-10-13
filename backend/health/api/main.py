from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import date, timedelta

from fastapi import Depends, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.orm import Session

from health import __version__
from health.api.auth import require_token
from health.db import get_session, init_db
from health.models import Activity, BodyMetric, Daily, Score, SleepSession, SyncLog
from health.sources.apple_health import HKPayload, ingest


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


def _day_payload(s: Session, d: date) -> dict:
    daily = s.get(Daily, d)
    sleep = s.execute(
        select(SleepSession).where(SleepSession.date == d, SleepSession.is_nap.is_(False))
    ).scalar_one_or_none()
    acts = s.execute(
        select(Activity)
        .where(Activity.start_ts >= d, Activity.start_ts < d + timedelta(days=1))
        .order_by(Activity.start_ts)
    ).scalars()
    return {
        "date": d.isoformat(),
        "scores": _scores_for(s, d),
        "daily": {
            "steps": daily.steps if daily else None,
            "calories": daily.calories if daily else None,
            "rhr": daily.rhr if daily else None,
            "stress_avg": daily.stress_avg if daily else None,
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
                "start": a.start_ts.isoformat(),
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
            "start": a.start_ts.isoformat(),
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
