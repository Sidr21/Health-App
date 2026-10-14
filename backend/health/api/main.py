from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import Body, Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from health import __version__
from health.api.auth import require_token
from health.api.documents import router as documents_router
from health.compute import (
    body_summary,
    fitness_models,
    hr_max_for,
    journal_insights,
    strength_summary,
    workout_detail,
    zones_payload,
)
from health.config import check_public_token, settings, today_local
from health.db import get_session, init_db
from health.engine.muscles import MUSCLES, catalog, common_exercises
from health.models import (
    Activity,
    BodyMetric,
    Daily,
    JournalEntry,
    Score,
    SleepSegment,
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
    check_public_token()
    init_db()
    from health import scheduler
    from health.sources.documents import recover_interrupted

    recover_interrupted()

    scheduler.seed_coros_token()
    task = None
    if settings.sync_interval_min > 0:
        task = scheduler.start_background(scheduler.sync_loop())
    yield
    if task:
        task.cancel()


app = FastAPI(
    title="Health App API",
    version=__version__,
    lifespan=_lifespan,
    docs_url="/docs" if settings.docs else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.docs else None,
)
# The native app does not need CORS; the Expo web preview does. Auth is the bearer token.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(documents_router)


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
    segments = []
    if sleep is not None:
        q = select(SleepSegment).where(SleepSegment.date == d).order_by(SleepSegment.start_ts)
        if sleep.start_ts and sleep.end_ts:
            # only the main night: drop naps and fragments outside its window. The COROS
            # window is local wall-clock time; segments are UTC.
            zone = ZoneInfo(settings.timezone)
            w0 = sleep.start_ts.replace(tzinfo=zone).astimezone(UTC).replace(tzinfo=None)
            w1 = sleep.end_ts.replace(tzinfo=zone).astimezone(UTC).replace(tzinfo=None)
            q = q.where(
                SleepSegment.end_ts > w0 - timedelta(hours=1),
                SleepSegment.start_ts < w1 + timedelta(hours=1),
            )
        segments = [
            {
                "start": x.start_ts.replace(tzinfo=UTC).isoformat(),
                "end": x.end_ts.replace(tzinfo=UTC).isoformat(),
                "stage": x.stage,
            }
            for x in s.execute(q).scalars()
            if x.stage != "inbed"
        ]
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
    from health import day_status

    vitals = dict(
        s.execute(
            select(BodyMetric.metric, func.avg(BodyMetric.value))
            .where(
                BodyMetric.ts >= lo,
                BodyMetric.ts < hi,
                BodyMetric.metric.in_(("resp_rate", "spo2_pct")),
            )
            .group_by(BodyMetric.metric)
        ).all()
    )
    return {
        "date": d.isoformat(),
        "status": day_status.on_day(s, d),
        "vitals": {k: round(v, 1) for k, v in vitals.items()},
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
                "segments": segments,
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
    return _day_payload(s, today_local())


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


@app.get("/activities/{activity_id}", dependencies=[Depends(require_token)])
def activity_detail(activity_id: int, s: Session = Depends(get_session)) -> dict:
    out = workout_detail(s, activity_id)
    if out is None:
        raise HTTPException(404, "no such activity")
    return out


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


# ---------------------------------------------------------------- connections


def _base_url(request: Request) -> str:
    """This server's public URL: the setting, else what the proxy (Fly) says it is."""
    if settings.public_url:
        return settings.public_url.rstrip("/")
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    return f"{proto}://{host}"


@app.get("/connections", dependencies=[Depends(require_token)])
def connections(s: Session = Depends(get_session)) -> dict:
    """What each data source has delivered, for the Connections screen."""
    from health import scheduler

    coros_last = s.execute(
        select(func.max(SyncLog.ts)).where(SyncLog.source == "coros", SyncLog.ok.is_(True))
    ).scalar_one()
    newest = s.execute(
        select(func.max(Activity.start_ts)).where(Activity.source == "coros")
    ).scalar_one()
    apple = s.execute(
        select(BodyMetric.metric, func.count(), func.max(BodyMetric.ts))
        .where(BodyMetric.source.like("apple:%"))
        .group_by(BodyMetric.metric)
    ).all()
    nights = s.execute(
        select(func.count(func.distinct(SleepSegment.date))).where(
            SleepSegment.source.like("apple:%")
        )
    ).scalar_one()
    lifting = s.execute(
        select(StrengthSet.source, func.count(), func.max(StrengthSet.ts)).group_by(
            StrengthSet.source
        )
    ).all()

    def iso(ts):
        return ts.replace(tzinfo=UTC).isoformat() if ts else None

    return {
        "coros": {
            "connected": scheduler.coros_authorized(),
            "last_sync": iso(coros_last),
            "newest_activity": iso(newest),
            "sync": scheduler.state.public(),
        },
        "apple_health": {
            "last_sample": iso(max((t for _, _, t in apple), default=None)),
            "metrics": [{"metric": m, "samples": n, "latest": iso(t)} for m, n, t in sorted(apple)],
            "sleep_nights": nights,
        },
        "strength": [{"source": src, "sets": n, "latest": iso(t)} for src, n, t in sorted(lifting)],
        "server": {"version": __version__, "public": settings.public, "tz": settings.timezone},
    }


class CorosLoginIn(BaseModel):
    return_to: str | None = Field(None, max_length=200)


@app.post("/connect/coros/start", dependencies=[Depends(require_token)])
async def coros_login_start(request: Request, body: CorosLoginIn | None = None) -> dict:
    """Start a COROS login; the app opens `auth_url` in an in-app browser."""
    from health.sources.coros import web_login

    return_to = body.return_to if body else None
    if return_to and not return_to.startswith(("healthapp://", "exp+health-app://")):
        raise HTTPException(422, "return_to must be an app link")
    callback = f"{_base_url(request)}/connect/coros/callback"
    try:
        url = await web_login.start(callback, return_to)
    except web_login.LoginError as e:
        raise HTTPException(502, str(e)) from e
    return {"auth_url": url, "callback_url": callback}


_PAGE = (
    "<html><head><meta name='viewport' content='width=device-width'></head>"
    "<body style='font-family:-apple-system,sans-serif;background:#0B0B0E;color:#fff;"
    "padding:40px 24px'><h2>{title}</h2><p style='color:#aaa'>{body}</p></body></html>"
)


@app.get("/connect/coros/callback", include_in_schema=False)
async def coros_login_callback(request: Request):
    """COROS redirects the browser here after login. No bearer token (it's the browser), but
    it only completes a login this server started, and the OAuth state must match."""
    from html import escape

    from health import scheduler
    from health.sources.coros import web_login

    try:
        return_to = await web_login.finish(dict(request.query_params))
    except web_login.LoginError as e:
        page = _PAGE.format(title="COROS login failed", body=escape(str(e)))
        return HTMLResponse(page, status_code=400)
    scheduler.start_background(scheduler.run_once(settings.sync_full_days))
    if return_to:
        return RedirectResponse(f"{return_to}?coros=connected", status_code=302)
    page = _PAGE.format(title="COROS connected", body="Syncing now. You can close this page.")
    return HTMLResponse(page)


@app.delete("/connect/coros", dependencies=[Depends(require_token)])
def coros_disconnect() -> dict:
    """Forget the COROS login on this server (the sync stops until you connect again)."""
    from health.sources.coros import web_login

    return {"removed": web_login.disconnect(), "connected": False}


@app.get("/sync/state", dependencies=[Depends(require_token)])
def sync_state() -> dict:
    """The background sync: whether it runs, the last run's outcome, and the next run."""
    from health import scheduler

    return scheduler.state.public()


@app.post("/sync", dependencies=[Depends(require_token)])
async def sync_now(days: int | None = Query(None, ge=1, le=90)) -> dict:
    """Start a sync now (in the background) unless one is already running."""
    from health import scheduler

    if not scheduler.state.running:
        scheduler.start_background(scheduler.run_once(days))
        await asyncio.sleep(0)  # let it take the lock so the state below says running
    return scheduler.state.public()


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
    return strength_summary(s, day or today_local())


@app.get("/strength/exercises", dependencies=[Depends(require_token)])
def strength_exercises() -> dict:
    return {
        "exercises": catalog(),
        "common": common_exercises(),
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
    if start > datetime.now(UTC) + timedelta(minutes=15):
        raise HTTPException(422, "started_at is in the future")
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


# ---------------------------------------------------------------- journal


class JournalIn(BaseModel):
    date: date
    tag: str = Field(min_length=1, max_length=40, pattern=r"^[a-z0-9_]+$")
    value: float | None = None  # 1/0 for yes/no tags, a number for amounts
    note: str | None = Field(None, max_length=500)


def _entry(r: JournalEntry) -> dict:
    return {"date": r.date.isoformat(), "tag": r.tag, "value": r.value, "note": r.note}


@app.get("/journal", dependencies=[Depends(require_token)])
def journal_list(
    start: date = Query(...), end: date = Query(...), s: Session = Depends(get_session)
) -> list[dict]:
    rows = s.execute(
        select(JournalEntry)
        .where(JournalEntry.date >= start, JournalEntry.date <= end)
        .order_by(JournalEntry.date, JournalEntry.tag)
    ).scalars()
    return [_entry(r) for r in rows]


@app.put("/journal", dependencies=[Depends(require_token)])
def journal_put(body: JournalIn, s: Session = Depends(get_session)) -> dict:
    row = s.execute(
        select(JournalEntry).where(JournalEntry.date == body.date, JournalEntry.tag == body.tag)
    ).scalar_one_or_none()
    if row is None:
        row = JournalEntry(date=body.date, tag=body.tag)
        s.add(row)
    row.value, row.note = body.value, body.note
    s.flush()
    return _entry(row)


@app.delete("/journal/{day}/{tag}", dependencies=[Depends(require_token)])
def journal_delete(day: date, tag: str, s: Session = Depends(get_session)) -> dict:
    res = s.execute(delete(JournalEntry).where(JournalEntry.date == day, JournalEntry.tag == tag))
    return {"deleted": res.rowcount}


@app.get("/journal/insights", dependencies=[Depends(require_token)])
def journal_insights_api(days: int = Query(90, ge=14, le=365), s: Session = Depends(get_session)):
    return journal_insights(s, today_local(), days)


class StatusIn(BaseModel):
    status: Literal["active", "rest_day", "sick", "travel"]


@app.get("/status", dependencies=[Depends(require_token)])
def status_get(s: Session = Depends(get_session)) -> dict:
    """Today's status ("until changed"); logs it to the journal for each day it has lasted."""
    from health import day_status

    return day_status.current(s, _today())


@app.put("/status", dependencies=[Depends(require_token)])
def status_put(body: StatusIn, s: Session = Depends(get_session)) -> dict:
    from health import day_status

    return day_status.set_status(s, body.status, _today())


# ---------------------------------------------------------------- body, settings, models


def _today() -> date:
    return today_local()


@app.get("/body/summary", dependencies=[Depends(require_token)])
def body_summary_api(days: int = Query(365, ge=7, le=3650), s: Session = Depends(get_session)):
    return body_summary(s, _today(), days)


@app.get("/bioage", dependencies=[Depends(require_token)])
def bioage_api(s: Session = Depends(get_session)) -> dict:
    """Latest biological age with each input's contribution, plus its history."""
    from health.models import FitnessEstimate

    rows = (
        s.execute(
            select(FitnessEstimate)
            .where(FitnessEstimate.metric == "bio_age")
            .order_by(FitnessEstimate.date)
        )
        .scalars()
        .all()
    )
    if not rows:
        return {"value": None, "history": []}
    last = rows[-1]
    week_ago = last.date - timedelta(days=7)
    prev = next((r for r in reversed(rows) if r.date <= week_ago), None)
    return {
        "value": last.value,
        "date": last.date.isoformat(),
        **(last.inputs or {}),
        "previous": (
            {
                "date": prev.date.isoformat(),
                "value": prev.value,
                "contributions": (prev.inputs or {}).get("contributions", {}),
                "inputs": (prev.inputs or {}).get("inputs", {}),
            }
            if prev
            else None
        ),
        "history": [{"date": r.date.isoformat(), "value": r.value} for r in rows],
    }


@app.get("/stress/{day}", dependencies=[Depends(require_token)])
def stress_api(day: date, s: Session = Depends(get_session)) -> dict:
    """One day's stress curve, sleep windows and minutes per COROS level while awake."""
    from health.compute_models import stress_day

    return stress_day(s, day)


class RaceIn(BaseModel):
    date: date
    distance_m: float = Field(ge=1500, le=42500)
    time_s: float = Field(gt=180, lt=8 * 3600)
    name: str | None = Field(None, max_length=80)


def _race_out(s: Session, r) -> dict:
    """A race with its VDOT and what we predicted for that distance the day before it."""
    from health.compute_models import latest_fitness
    from health.engine import fitness as fit

    pred = latest_fitness(s, r.date - timedelta(days=1)).get(("race_5k", "ours"))
    vdot_then = (pred.inputs or {}).get("vdot") if pred else None
    return {
        "id": r.id,
        "date": r.date.isoformat(),
        "name": r.name,
        "distance_m": r.distance_m,
        "time_s": r.time_s,
        "vdot": round(fit.vdot(r.distance_m, r.time_s), 1),
        "predicted_s": fit.race_time(vdot_then, r.distance_m) if vdot_then else None,
    }


def _refit(s: Session) -> None:
    from health.compute_models import compute_bioage, compute_fitness

    compute_fitness(s, _today())
    compute_bioage(s, _today())


@app.get("/races", dependencies=[Depends(require_token)])
def list_races(s: Session = Depends(get_session)) -> list[dict]:
    from health.models import Race

    rows = s.execute(select(Race).order_by(Race.date.desc())).scalars().all()
    return [_race_out(s, r) for r in rows]


@app.post("/races", dependencies=[Depends(require_token)])
def add_race(body: RaceIn, s: Session = Depends(get_session)) -> dict:
    """Record a race result, then refit VO2max, economy and predictions for today."""
    from health.models import Race

    if body.date > _today():
        raise HTTPException(422, "race date is in the future")
    r = Race(date=body.date, name=body.name, distance_m=body.distance_m, time_s=body.time_s)
    s.add(r)
    s.flush()
    _refit(s)
    return _race_out(s, r)


@app.delete("/races/{race_id}", dependencies=[Depends(require_token)])
def delete_race(race_id: int, s: Session = Depends(get_session)) -> dict:
    from health.models import Race

    r = s.get(Race, race_id)
    if r is None:
        raise HTTPException(404, "no such race")
    s.delete(r)
    s.flush()
    _refit(s)
    return {"deleted": race_id}


@app.get("/zones", dependencies=[Depends(require_token)])
def zones_api(s: Session = Depends(get_session)) -> dict:
    """Heart-rate zones from our HRmax and threshold HR, and pace zones from threshold pace."""
    return zones_payload(s, _today()) or {"hr": None, "pace": None}


@app.get("/fitness/models", dependencies=[Depends(require_token)])
def fitness_models_api(s: Session = Depends(get_session)) -> dict:
    return fitness_models(s, _today())


class SettingsIn(BaseModel):
    sex: Literal["male", "female"] | None = None
    dob: date | None = None
    height_cm: float | None = Field(None, ge=100, le=250)
    hr_max: int | None = Field(None, ge=120, le=230)
    hr_max_source: Literal["user", "field_test"] | None = None
    clear_hr_max: bool = False  # go back to the estimate
    units: Literal["imperial", "metric"] | None = None
    sleep_need_min: int | None = Field(None, ge=300, le=660)
    lthr: int | None = Field(None, ge=100, le=220)
    clear_lthr: bool = False  # go back to our estimate
    zone_basis: Literal["lthr", "hr_max"] | None = None


def _settings_payload(s: Session) -> dict:
    from health.models import User

    u = s.execute(select(User)).scalars().first()
    hm = hr_max_for(s, _today())
    coros_last = s.execute(
        select(func.max(SyncLog.ts)).where(SyncLog.source == "coros", SyncLog.ok.is_(True))
    ).scalar_one()
    apple_last = s.execute(
        select(func.max(BodyMetric.ts)).where(BodyMetric.source.like("apple:%"))
    ).scalar_one()
    newest_activity = s.execute(select(func.max(Activity.start_ts))).scalar_one()
    return {
        "profile": {
            "name": u.name if u else None,
            "sex": u.sex if u else None,
            "dob": u.dob.isoformat() if u and u.dob else None,
            "height_cm": u.height_cm if u else None,
        },
        "hr_max": {
            "set_value": u.hr_max if u else None,
            "set_source": u.hr_max_source if u else None,
            "effective": hm.value if hm else None,
            "method": hm.method if hm else None,
            "candidates": hm.candidates if hm else {},
        },
        "lthr": {"set_value": u.lthr if u else None},
        "zones": zones_payload(s, _today()),
        "units": (u.units if u else None) or "imperial",
        "sleep_need_min": (u.sleep_need_min if u else None) or 480,
        "timezone": settings.timezone,
        "sources": {
            "coros_last_sync": coros_last.replace(tzinfo=UTC).isoformat() if coros_last else None,
            "newest_activity": (
                newest_activity.replace(tzinfo=UTC).isoformat() if newest_activity else None
            ),
            "apple_last_sample": (
                apple_last.replace(tzinfo=UTC).isoformat() if apple_last else None
            ),
        },
    }


@app.get("/settings", dependencies=[Depends(require_token)])
def get_settings(s: Session = Depends(get_session)) -> dict:
    return _settings_payload(s)


@app.put("/settings", dependencies=[Depends(require_token)])
def put_settings(body: SettingsIn, s: Session = Depends(get_session)) -> dict:
    from health.models import User

    u = s.execute(select(User)).scalars().first()
    if u is None:
        u = User(name="me")
        s.add(u)
    for field in ("sex", "dob", "height_cm", "units", "sleep_need_min", "zone_basis"):
        v = getattr(body, field)
        if v is not None:
            setattr(u, field, v)
    if body.clear_hr_max:
        u.hr_max, u.hr_max_source = None, None
    elif body.hr_max is not None:
        u.hr_max, u.hr_max_source = body.hr_max, body.hr_max_source or "user"
    if body.clear_lthr:
        u.lthr = None
    elif body.lthr is not None:
        u.lthr = body.lthr
    s.flush()
    return _settings_payload(s)
