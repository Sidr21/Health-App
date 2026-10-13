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
from health.engine.workout import (
    HrMax,
    cardio_focus,
    downsample,
    estimate_hr_max,
    hr_recovery,
    time_in_zones_laps,
    time_in_zones_stream,
    zones,
)
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


# ---------------------------------------------------------------- workouts


def hr_max_for(s: Session, today: date | None = None) -> HrMax | None:
    from health.models import User

    today = today or date.today()
    user = s.execute(select(User)).scalars().first()
    since = datetime.combine(today - timedelta(days=365), datetime.min.time())
    observed = [
        h
        for (h,) in s.execute(
            select(Activity.max_hr).where(Activity.start_ts >= since, Activity.max_hr.is_not(None))
        )
    ]
    return estimate_hr_max(
        user.dob if user else None,
        today,
        observed,
        set_value=user.hr_max if user else None,
        set_source=user.hr_max_source if user else None,
    )


def workout_detail(s: Session, activity_id: int) -> dict | None:
    """Everything the workout screen shows. Zones use the stream when the FIT file is stored,
    else lap averages; each block says which it used."""
    from health.engine.muscles import MUSCLES, exercise_muscles, sport_shares
    from health.models import ActivityLap, ActivitySample

    a = s.get(Activity, activity_id)
    if a is None:
        return None
    detail = (a.raw_json or {}).get("detail", {})
    laps = (
        s.execute(
            select(ActivityLap).where(ActivityLap.activity_id == a.id).order_by(ActivityLap.idx)
        )
        .scalars()
        .all()
    )
    samples = (
        s.execute(
            select(ActivitySample)
            .where(ActivitySample.activity_id == a.id)
            .order_by(ActivitySample.t_offset_s)
        )
        .scalars()
        .all()
    )
    hm = hr_max_for(s, _local_day(a.start_ts))

    stream = [(x.t_offset_s, x.hr) for x in samples]
    zone_block = None
    hrr = None
    if hm is not None:
        if any(h for _, h in stream):
            secs = time_in_zones_stream(stream, hm.value)
            method = "stream"
            hrr = hr_recovery(stream, hm.value)
        else:
            secs = time_in_zones_laps([(lap.duration_s, lap.avg_hr) for lap in laps], hm.value)
            method = "laps"
        if sum(secs) > 0:
            zone_block = {
                "method": method,
                "zones": [
                    {**z, "seconds": round(sec)}
                    for z, sec in zip(zones(hm.value), secs, strict=True)
                ],
                "focus": cardio_focus(secs),
            }

    if is_strength(a):
        sets = s.execute(select(StrengthSet).where(StrengthSet.activity_id == a.id)).scalars()
        weights: dict[str, float] = {}
        for r in sets:
            for m, w in exercise_muscles(r.exercise).muscles.items():
                weights[m] = weights.get(m, 0.0) + w
        total = sum(weights.values()) or 1.0
        shares = {m: w / total for m, w in weights.items()}
    else:
        shares, _ = sport_shares(a.sport)
    muscles = [
        {"id": m, "name": MUSCLES[m].name, "share": round(100 * v, 1)}
        for m, v in sorted(shares.items(), key=lambda kv: -kv[1])
        if v > 0
    ]

    rows = [
        {
            "t": x.t_offset_s,
            "hr": x.hr,
            "speed_mps": x.speed_mps,
            "alt_m": x.alt_m,
            "power_w": x.power_w,
            "cadence": x.cadence,
        }
        for x in samples
    ]
    return {
        "id": a.id,
        "source": a.source,
        "sport": a.sport,
        "sport_code": a.sport_code,
        "location": a.location,
        "start": a.start_ts.replace(tzinfo=UTC).isoformat(),
        "end": a.end_ts.replace(tzinfo=UTC).isoformat() if a.end_ts else None,
        "stats": {
            "active_s": detail.get("workout_time_s") or a.duration_s,
            "total_s": detail.get("total_time_s")
            or ((a.end_ts - a.start_ts).total_seconds() if a.end_ts else None),
            "distance_m": a.distance_m,
            "avg_pace_s_per_km": a.avg_pace_s_per_km,
            "best_km_s": detail.get("best_km_s"),
            "avg_hr": a.avg_hr,
            "max_hr": a.max_hr,
            "avg_power_w": a.avg_power_w,
            "avg_cadence": detail.get("avg_cadence"),
            "stride_m": detail.get("stride_m"),
            "elev_gain_m": a.elev_gain_m,
            "elev_loss_m": detail.get("elev_loss_m"),
            "calories": a.calories,
        },
        "coros": {
            "training_load": a.coros_training_load,
            "aerobic_te": a.coros_aerobic_te,
            "anaerobic_te": a.coros_anaerobic_te,
            "training_focus": detail.get("training_focus"),
            "performance": detail.get("performance"),
        },
        "hr_max": (
            {"value": hm.value, "method": hm.method, "candidates": hm.candidates} if hm else None
        ),
        "zones": zone_block,
        "hr_recovery": hrr,
        "stream": {"n": len(rows), "points": downsample(rows, 300)},
        "laps": [
            {
                "idx": lap.idx,
                "duration_s": lap.duration_s,
                "distance_m": lap.distance_m,
                "avg_hr": lap.avg_hr,
                "max_hr": lap.max_hr,
                "avg_pace_s_per_km": lap.avg_pace_s_per_km,
                "avg_power_w": lap.avg_power_w,
                "avg_cadence": lap.avg_cadence,
            }
            for lap in laps
        ],
        "muscles": muscles,
    }


# ---------------------------------------------------------------- journal insights


def journal_insights(s: Session, end: date, days: int = 90) -> dict:
    from health.engine.insights import OUTCOMES, tag_effects
    from health.models import JournalEntry

    start = end - timedelta(days=days)
    entries: dict[date, dict[str, float]] = {}
    for r in s.execute(
        select(JournalEntry).where(JournalEntry.date >= start, JournalEntry.date <= end)
    ).scalars():
        if r.value is not None:
            entries.setdefault(r.date, {})[r.tag] = r.value
    outcomes: dict[date, dict[str, float]] = {}
    for r in s.execute(
        select(Score).where(
            Score.date > start,
            Score.date <= end + timedelta(days=1),
            Score.kind.in_(["recovery", "sleep"]),
        )
    ).scalars():
        o = outcomes.setdefault(r.date, {})
        o[r.kind] = r.value
        if r.kind == "recovery" and r.components and r.components.get("hrv_ms"):
            o["hrv_ms"] = r.components["hrv_ms"]
    for r in s.execute(
        select(Daily).where(Daily.date > start, Daily.date <= end + timedelta(days=1))
    ).scalars():
        if r.rhr:
            outcomes.setdefault(r.date, {})["rhr"] = r.rhr
    effects = tag_effects(entries, outcomes)
    return {
        "window": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "logged_days": len(entries),
        "method": "next-morning mean, yes vs no (median split for numbers), Welch z; min 5 each",
        "outcomes": {
            k: {"label": v[0], "unit": v[1], "higher_is_better": v[2]} for k, v in OUTCOMES.items()
        },
        "effects": [e.__dict__ for e in effects],
    }


# ---------------------------------------------------------------- body, settings, fitness


BODY_METRICS = {
    # metric: (label, unit)
    "weight_kg": ("Weight", "kg"),
    "bmi": ("BMI", ""),
    "body_fat_pct": ("Body fat", "%"),
    "lean_mass_kg": ("Lean mass", "kg"),
    "waist_cm": ("Waist", "cm"),
}


def body_summary(s: Session, end: date, days: int = 365) -> dict:
    """Latest value, 30-day change and a one-point-per-day series for each body metric.
    BMI comes from Apple Health when the scale writes it, else weight / height²."""
    from health.models import BodyMetric, User

    since = datetime.combine(end - timedelta(days=days), datetime.min.time())
    rows = (
        s.execute(select(BodyMetric).where(BodyMetric.ts >= since).order_by(BodyMetric.ts))
        .scalars()
        .all()
    )
    user = s.execute(select(User)).scalars().first()
    heights = [r.value for r in rows if r.metric == "height_cm"]
    height = heights[-1] if heights else (user.height_cm if user else None)

    series: dict[str, dict[str, tuple[float, str]]] = {}
    for r in rows:
        day = _local_day(r.ts).isoformat()
        series.setdefault(r.metric, {})[day] = (r.value, r.source)  # last reading of the day
    bmi_method = "apple" if series.get("bmi") else None
    if not series.get("bmi") and height and series.get("weight_kg"):
        bmi_method = "weight/height^2"
        m = (height / 100) ** 2
        series["bmi"] = {
            d: (round(w / m, 1), "computed") for d, (w, _) in series["weight_kg"].items()
        }

    out = {}
    for metric, (label, unit) in BODY_METRICS.items():
        pts = sorted(series.get(metric, {}).items())
        if not pts:
            out[metric] = {"label": label, "unit": unit, "latest": None, "series": []}
            continue
        last_day, (last_val, last_src) = pts[-1]
        cutoff = (date.fromisoformat(last_day) - timedelta(days=30)).isoformat()
        older = [v for d, (v, _) in pts if d <= cutoff]
        out[metric] = {
            "label": label,
            "unit": unit,
            "latest": {"date": last_day, "value": round(last_val, 2), "source": last_src},
            "change_30d": round(last_val - older[-1], 2) if older else None,
            "series": [{"date": d, "value": round(v, 2)} for d, (v, _) in pts],
        }
    out["bmi"]["method"] = bmi_method
    return {"height_cm": height, "metrics": out}


RACES = [
    ("race_5k", "5K", 5000),
    ("race_10k", "10K", 10000),
    ("race_hm", "Half marathon", 21097.5),
    ("race_m", "Marathon", 42195),
]


def fitness_models(s: Session, today: date) -> dict:
    """Our model estimates next to COROS's. Ours need FIT streams (DESIGN §6.5–6.6), so until
    those are synced each block says what it is waiting for."""
    from health.models import ActivitySample, FitnessEstimate

    latest: dict[tuple[str, str], FitnessEstimate] = {}
    for r in s.execute(select(FitnessEstimate).order_by(FitnessEstimate.date)).scalars():
        latest[(r.metric, r.method)] = r

    def coros(metric: str) -> dict | None:
        r = latest.get((metric, "coros"))
        return {"value": r.value, "date": r.date.isoformat()} if r else None

    runs = s.execute(select(Activity).where(Activity.sport.ilike("%run%"))).scalars().all()
    with_stream = {a for (a,) in s.execute(select(ActivitySample.activity_id).distinct())}
    n_stream = sum(1 for a in runs if a.id in with_stream)
    hm = hr_max_for(s, today)
    waiting = (
        f"Needs heart-rate + pace streams from FIT files ({n_stream} of {len(runs)} runs "
        "synced). Runs on the Mac sync."
    )
    return {
        "hr_max": (
            {"value": hm.value, "method": hm.method, "candidates": hm.candidates} if hm else None
        ),
        "vo2max": {"coros": coros("vo2max"), "ours": None, "status": waiting},
        "running_level": coros("running_level"),
        "threshold": {
            "coros_pace_s_per_km": coros("threshold_pace"),
            "ours_lthr": None,
            "ours_pace_s_per_km": None,
            "status": waiting,
        },
        "races": [
            {"key": k, "label": label, "distance_m": dist, "coros_s": coros(k), "ours_s": None}
            for k, label, dist in RACES
        ],
        "inputs": {"runs": len(runs), "runs_with_streams": n_stream},
    }
