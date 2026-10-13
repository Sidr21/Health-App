"""Turn stored raw data into scores (DB-aware glue around the pure engine)."""

from __future__ import annotations

import math
import statistics
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from health.config import settings
from health.engine.baselines import rolling_baseline
from health.engine.hrv import nightly_hrv
from health.engine.muscles import (
    CARDIO_LOAD_PER_SET,
    FATIGUED,
    FRESHNESS_K,
    RECOVERED,
    Dose,
    doses_for_activity,
    doses_for_set,
    muscle_states,
    muscular_load,
)
from health.engine.muscles import METHOD as MUSCLE_METHOD
from health.engine.recovery import RecoveryInputs, recovery_score
from health.engine.sleep import SleepInputs, sleep_score
from health.models import Activity, Daily, HrvSample, Score, SleepSession, StrengthSet
from health.sources.strength_store import is_strength

SCORE_VERSION = 1
HISTORY_DAYS = 60


def _minutes_of_day(ts: datetime) -> float:
    """Minutes since noon, so bed/wake times around midnight do not straddle a wrap point."""
    return (ts.hour * 60 + ts.minute - 720) % 1440


def _dev_minutes(value: float | None, ref: list[float]) -> float | None:
    if value is None or len(ref) < 3:
        return None
    med = statistics.median(ref)
    diff = abs(value - med)
    return min(diff, 1440 - diff)  # wrap around midnight


def _upsert_score(s: Session, d: date, kind: str, value: float, components: dict) -> None:
    row = s.execute(select(Score).where(Score.date == d, Score.kind == kind)).scalar_one_or_none()
    if row is None:
        row = Score(date=d, kind=kind, value=value)
        s.add(row)
    row.value = value
    row.components = components
    row.version = SCORE_VERSION


def compute_day(s: Session, d: date) -> dict[str, float | None]:
    """Compute nightly HRV, sleep score and recovery for wake-up day `d`."""
    start = d - timedelta(days=HISTORY_DAYS)
    dailies = {
        r.date: r
        for r in s.execute(select(Daily).where(Daily.date >= start, Daily.date <= d)).scalars()
    }
    sleeps = {
        r.date: r
        for r in s.execute(
            select(SleepSession).where(
                SleepSession.date >= start, SleepSession.date <= d, SleepSession.is_nap.is_(False)
            )
        ).scalars()
    }
    hrv_rows = s.execute(
        select(HrvSample).where(
            HrvSample.context == "sleep", HrvSample.date >= start, HrvSample.date <= d
        )
    ).scalars()
    by_day: dict[date, list[tuple[int, float, int | None]]] = {}
    for r in hrv_rows:
        by_day.setdefault(r.date, []).append((int(r.ts.timestamp()), r.rmssd_ms, r.confidence))

    days = [start + timedelta(days=k) for k in range((d - start).days + 1)]

    def hrv_for(day: date) -> float | None:
        pts = by_day.get(day)
        if not pts:
            # no raw samples stored for this night: fall back to COROS's nightly average
            d_row = dailies.get(day)
            if d_row is not None and d_row.coros_hrv_avg:
                return math.log(d_row.coros_hrv_avg)
            return None
        sl = sleeps.get(day)
        window = None
        if sl and sl.start_ts and sl.end_ts:
            window = (int(sl.start_ts.timestamp()), int(sl.end_ts.timestamp()))
        return nightly_hrv(pts, window=window).ln_rmssd

    ln_series = [hrv_for(day) for day in days]
    rhr_series = [dailies[day].rhr if day in dailies else None for day in days]
    shr_series = [sleeps[day].hr_avg if day in sleeps else None for day in days]

    ln_base = rolling_baseline(ln_series, 28)
    rhr_base = rolling_baseline(rhr_series, 28)
    shr_base = rolling_baseline(shr_series, 28)

    out: dict[str, float | None] = {"ln_rmssd": ln_series[-1], "rhr": rhr_series[-1]}
    out["hrv_ms"] = round(math.exp(ln_series[-1]), 1) if ln_series[-1] is not None else None

    sl = sleeps.get(d)
    sleep_val: float | None = None
    if sl and sl.asleep_s:
        bed_ref = [
            _minutes_of_day(x.start_ts) for x in sleeps.values() if x.start_ts and x.date < d
        ][-14:]
        wake_ref = [_minutes_of_day(x.end_ts) for x in sleeps.values() if x.end_ts and x.date < d][
            -14:
        ]
        sleep_val, comps = sleep_score(
            SleepInputs(
                asleep_s=sl.asleep_s,
                in_bed_s=sl.in_bed_s,
                deep_s=sl.deep_s,
                rem_s=sl.rem_s,
                awake_count=sl.awake_count,
                awake_s=sl.awake_s,
                hr_min=sl.hr_min,
                hr_avg=sl.hr_avg,
                rhr_28d=rhr_base.mean,
                sleep_hr_avg_28d=shr_base.mean,
                bedtime_dev_min=_dev_minutes(
                    _minutes_of_day(sl.start_ts) if sl.start_ts else None, bed_ref
                ),
                waketime_dev_min=_dev_minutes(
                    _minutes_of_day(sl.end_ts) if sl.end_ts else None, wake_ref
                ),
            )
        )
        _upsert_score(s, d, "sleep", sleep_val, comps)
    out["sleep"] = sleep_val

    rec = recovery_score(
        RecoveryInputs(
            ln_rmssd=ln_series[-1],
            ln_rmssd_base=ln_base,
            rhr=rhr_series[-1],
            rhr_base=rhr_base,
            sleep_score=sleep_val,
            sleep_hr_avg=shr_series[-1],
            sleep_hr_base=shr_base,
        )
    )
    if rec.score is not None:
        _upsert_score(
            s,
            d,
            "recovery",
            rec.score,
            {
                "z": rec.components,
                "band": rec.band,
                "calibrating": rec.calibrating,
                "n_days": rec.n_days,
                "hrv_ms": out["hrv_ms"],
                "hrv_base_ms": round(math.exp(ln_base.mean), 1) if ln_base.mean else None,
                "rhr": rhr_series[-1],
                "rhr_base": round(rhr_base.mean, 1) if rhr_base.mean else None,
            },
        )
    out["recovery"] = rec.score
    out["muscular"] = store_muscular_score(s, d)["load"]["acute"]
    return out


def compute_range(s: Session, start: date, end: date) -> int:
    n = 0
    d = start
    while d <= end:
        compute_day(s, d)
        n += 1
        d += timedelta(days=1)
    return n


# ---------------------------------------------------------------- muscles / strength

STRENGTH_WINDOW_DAYS = 35  # 28-day chronic load + a week of decay history
_OVERLAP = timedelta(minutes=30)


def _utc(local: datetime) -> datetime:
    return local.astimezone(UTC).replace(tzinfo=None)


def _local_day(ts: datetime) -> date:
    return ts.replace(tzinfo=UTC).astimezone(ZoneInfo(settings.timezone)).date()


def _end_of_local_day(d: date) -> datetime:
    zone = ZoneInfo(settings.timezone)
    return _utc(datetime.combine(d + timedelta(days=1), datetime.min.time(), tzinfo=zone))


def muscle_doses(s: Session, start: datetime, end: datetime) -> tuple[list[Dose], dict]:
    """All muscle doses with timestamps in [start, end) (naive UTC), plus what went in.

    Double counting is avoided two ways: a COROS strength activity that has logged sets is
    counted from its sets, not from its sport share; and when a CSV/manual session overlaps a
    COROS strength activity (the watch recorded the same workout), the COROS copy is dropped
    because the other source has the weights.
    """
    sets = (
        s.execute(
            select(StrengthSet)
            .where(StrengthSet.ts >= start - timedelta(hours=6), StrengthSet.ts < end)
            .order_by(StrengthSet.ts)
        )
        .scalars()
        .all()
    )
    acts = (
        s.execute(select(Activity).where(Activity.start_ts >= start, Activity.start_ts < end))
        .scalars()
        .all()
    )

    spans: dict[tuple[str, str], list[datetime]] = {}
    for r in sets:
        if r.source != "coros":
            spans.setdefault((r.source, r.session_key), []).append(r.ts)
    other = [(min(v), max(v)) for v in spans.values()]
    covered: set[int] = set()
    for a in acts:
        if not is_strength(a):
            continue
        a_end = a.end_ts or a.start_ts + timedelta(seconds=a.duration_s or 3600)
        if any(lo <= a_end + _OVERLAP and hi >= a.start_ts - _OVERLAP for lo, hi in other):
            covered.add(a.id)

    doses: list[Dose] = []
    with_sets: set[int] = set()
    n_sets = 0
    for r in sets:
        if r.ts < start:
            continue
        if r.activity_id is not None:
            with_sets.add(r.activity_id)
            if r.activity_id in covered:
                continue
        n_sets += 1
        doses += doses_for_set(r.ts, r.date, r.exercise, r.reps, r.weight_kg, r.set_type)
    n_acts = 0
    for a in acts:
        if a.id in covered or a.id in with_sets:
            continue
        n_acts += 1
        doses += doses_for_activity(
            a.start_ts, _local_day(a.start_ts), a.sport, a.coros_training_load, a.duration_s
        )
    return doses, {"sets": n_sets, "activities": n_acts, "duplicates_dropped": len(covered)}


def _volume(r: StrengthSet) -> float:
    if r.set_type == "warmup" or not r.reps or not r.weight_kg:
        return 0.0
    return r.reps * r.weight_kg


def strength_summary(s: Session, d: date, *, now: datetime | None = None) -> dict:
    """Everything the Fitness strength section and the Muscle Groups screen show for day `d`.

    Freshness is evaluated at the end of `d`, or now if `d` is today."""
    now = now or datetime.now(UTC).replace(tzinfo=None)
    at = min(now, _end_of_local_day(d))
    start = at - timedelta(days=STRENGTH_WINDOW_DAYS)
    doses, inputs = muscle_doses(s, start, at + timedelta(seconds=1))
    states = muscle_states(doses, at)
    load = muscular_load(doses, at)

    days14 = [d - timedelta(days=k) for k in range(13, -1, -1)]
    rows = (
        s.execute(
            select(StrengthSet)
            .where(StrengthSet.date >= days14[0], StrengthSet.date <= d)
            .order_by(StrengthSet.ts)
        )
        .scalars()
        .all()
    )
    by_day = {
        day: {"date": day.isoformat(), "sets": 0, "volume_kg": 0.0, "load": 0.0} for day in days14
    }
    for r in rows:
        if r.set_type != "warmup":
            by_day[r.date]["sets"] += 1
        by_day[r.date]["volume_kg"] += _volume(r)
    for x in doses:
        if x.day in by_day:
            by_day[x.day]["load"] += x.load
    series = list(by_day.values())
    for p in series:
        p["volume_kg"] = round(p["volume_kg"], 1)
        p["load"] = round(p["load"], 2)
    this_week, prev_week = series[7:], series[:7]

    sessions: dict[tuple[str, str], dict] = {}
    for r in rows:
        if r.date < days14[7]:
            continue
        sess = sessions.setdefault(
            (r.source, r.session_key),
            {
                "key": r.session_key,
                "source": r.source,
                "name": r.workout_name,
                "start": r.ts.replace(tzinfo=UTC).isoformat(),
                "date": r.date.isoformat(),
                "sets": 0,
                "volume_kg": 0.0,
                "exercises": {},
            },
        )
        ex = sess["exercises"].setdefault(
            r.exercise,
            {"name": r.exercise, "sets": 0, "reps": 0, "best_weight_kg": None, "best_reps": None},
        )
        if r.set_type != "warmup":
            sess["sets"] += 1
            ex["sets"] += 1
            ex["reps"] += r.reps or 0
        sess["volume_kg"] += _volume(r)
        if r.weight_kg and (ex["best_weight_kg"] is None or r.weight_kg > ex["best_weight_kg"]):
            ex["best_weight_kg"], ex["best_reps"] = r.weight_kg, r.reps
        elif ex["best_weight_kg"] is None and r.reps and (ex["best_reps"] or 0) < r.reps:
            ex["best_reps"] = r.reps
    session_list = []
    for sess in sorted(sessions.values(), key=lambda x: x["start"], reverse=True):
        sess["volume_kg"] = round(sess["volume_kg"], 1)
        sess["exercises"] = list(sess["exercises"].values())
        session_list.append(sess)

    return {
        "date": d.isoformat(),
        "at": at.replace(tzinfo=UTC).isoformat(),
        "method": {
            "name": MUSCLE_METHOD,
            "freshness_k": FRESHNESS_K,
            "cardio_load_per_set": CARDIO_LOAD_PER_SET,
            "bands": {"recovered": RECOVERED, "depleted_below": FATIGUED},
            "inputs": inputs,
        },
        "muscles": [
            {
                "id": st.id,
                "name": st.name,
                "views": list(st.views),
                "freshness": st.freshness,
                "status": st.status,
                "fatigue": st.fatigue,
                "load_7d": st.load_7d,
                "sets_7d": st.sets_7d,
                "volume_7d_kg": st.volume_7d_kg,
                "last_trained": (
                    st.last_trained.replace(tzinfo=UTC).isoformat() if st.last_trained else None
                ),
                "sources": st.sources,
            }
            for st in states.values()
        ],
        "totals": {
            "sets_7d": sum(p["sets"] for p in this_week),
            "volume_7d_kg": round(sum(p["volume_kg"] for p in this_week), 1),
            "sessions_7d": len(session_list),
            "sets_prev_7d": sum(p["sets"] for p in prev_week),
            "volume_prev_7d_kg": round(sum(p["volume_kg"] for p in prev_week), 1),
        },
        "load": {
            "acute": load.acute,
            "chronic": load.chronic,
            "ratio": load.ratio,
            "optimal": list(load.optimal) if load.optimal else None,
            "status": load.status,
        },
        "daily": this_week,
        "sessions": session_list,
    }


def store_muscular_score(s: Session, d: date) -> dict:
    summary = strength_summary(s, d, now=_end_of_local_day(d))
    _upsert_score(
        s,
        d,
        "muscular",
        summary["load"]["acute"],
        {
            **summary["load"],
            "method": summary["method"],
            "freshness": {m["id"]: m["freshness"] for m in summary["muscles"]},
        },
    )
    return summary
