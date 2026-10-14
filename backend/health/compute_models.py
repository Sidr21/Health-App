"""DB glue for strain / cardio load, stress, energy, fitness models and biological age.

Pure maths lives in health.engine.{load, energy, fitness, bioage}; this module only loads rows,
calls the engine and stores results (scores / fitness tables) with their inputs and method.
"""

from __future__ import annotations

import statistics
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from health.compute import _end_of_local_day, _local_day, _upsert_score, body_summary, hr_max_for
from health.config import settings
from health.engine import bioage as bio
from health.engine import energy as en
from health.engine import fitness as fit
from health.engine import load as ld
from health.models import (
    Activity,
    ActivitySample,
    Daily,
    FitnessEstimate,
    Race,
    Score,
    SleepSession,
    StressSample,
    User,
)

LOAD_HISTORY_DAYS = 120
FITNESS_WINDOW_DAYS = 90
MODELS_VERSION = 1


def _user(s: Session) -> User | None:
    return s.execute(select(User)).scalars().first()


def _rhr_on(s: Session, d: date) -> float | None:
    """That day's resting HR, else the mean of the previous 14 days."""
    row = s.get(Daily, d)
    if row and row.rhr:
        return float(row.rhr)
    vals = [
        r
        for (r,) in s.execute(
            select(Daily.rhr).where(Daily.date >= d - timedelta(days=14), Daily.date < d)
        )
        if r
    ]
    return statistics.fmean(vals) if vals else None


def _stream(s: Session, activity_id: int) -> list[ActivitySample]:
    return (
        s.execute(
            select(ActivitySample)
            .where(ActivitySample.activity_id == activity_id)
            .order_by(ActivitySample.t_offset_s)
        )
        .scalars()
        .all()
    )


def _rows(samples: list[ActivitySample]) -> list[dict]:
    return [
        {
            "t": x.t_offset_s,
            "hr": x.hr,
            "speed_mps": x.speed_mps,
            "distance_m": x.distance_m,
            "alt_m": x.alt_m,
            "cadence": x.cadence,
        }
        for x in samples
    ]


# ---------------------------------------------------------------- strain + cardio load


def _workout_steps(a: Activity) -> float:
    """Steps a foot workout already contributed to the daily step count."""
    name = (a.sport or "").lower()
    if not a.duration_s or not any(k in name for k in ("run", "walk", "hike", "trek")):
        return 0.0
    spm = ((a.raw_json or {}).get("fit_session") or {}).get("avg_cadence") or (
        (a.raw_json or {}).get("detail") or {}
    ).get("avg_cadence")
    spm = spm or (160 if "run" in name else 110)
    return a.duration_s / 60 * spm


def activity_load(s: Session, a: Activity, *, hr_max: float | None, sex: str | None) -> dict:
    rhr = _rhr_on(s, _local_day(a.start_ts))
    samples = _stream(s, a.id)
    stream = [(x.t_offset_s, x.hr) for x in samples] if samples else None
    w = ld.workout_trimp(
        stream=stream,
        duration_s=a.duration_s,
        avg_hr=a.avg_hr,
        coros_load=a.coros_training_load,
        rhr=rhr,
        hr_max=hr_max,
        sex=sex,
    )
    return {
        "id": a.id,
        "sport": a.sport,
        "sport_code": a.sport_code,
        "start": a.start_ts.replace(tzinfo=UTC).isoformat(),
        "end": (a.end_ts or a.start_ts + timedelta(seconds=a.duration_s or 0))
        .replace(tzinfo=UTC)
        .isoformat(),
        "trimp": w.trimp,
        "method": w.method,
        "strain": ld.strain(w.trimp),
        "steps": round(_workout_steps(a)),
    }


def daily_trimp(s: Session, start: date, end: date) -> dict[date, dict]:
    """Per local day: workouts with TRIMP, step TRIMP outside workouts, totals and strain."""
    hm = hr_max_for(s, end)
    user = _user(s)
    sex = user.sex if user else None
    lo = datetime.combine(start - timedelta(days=1), datetime.min.time())
    hi = datetime.combine(end + timedelta(days=2), datetime.min.time())
    acts = s.execute(
        select(Activity).where(Activity.start_ts >= lo, Activity.start_ts < hi)
    ).scalars()
    by_day: dict[date, list[dict]] = {}
    for a in acts:
        d = _local_day(a.start_ts)
        if start <= d <= end:
            by_day.setdefault(d, []).append(
                activity_load(s, a, hr_max=hm.value if hm else None, sex=sex)
            )
    dailies = {
        r.date: r
        for r in s.execute(select(Daily).where(Daily.date >= start, Daily.date <= end)).scalars()
    }
    out = {}
    d = start
    while d <= end:
        workouts = by_day.get(d, [])
        steps = dailies[d].steps if d in dailies else None
        step_trimp = ld.nonworkout_trimp(steps, sum(w["steps"] for w in workouts))
        total = round(sum(w["trimp"] for w in workouts) + step_trimp, 1)
        out[d] = {
            "workouts": workouts,
            "steps": steps,
            "step_trimp": step_trimp,
            "trimp": total,
            "strain": ld.strain(total),
        }
        d += timedelta(days=1)
    return out


def store_load_scores(s: Session, start: date, end: date) -> int:
    """Strain for each day in [start, end] plus CTL / ATL / TSB (needs earlier history)."""
    hist_start = start - timedelta(days=LOAD_HISTORY_DAYS)
    per_day = daily_trimp(s, hist_start, end)
    days = sorted(per_day)
    series = ld.training_load(days, {d: v["trimp"] for d, v in per_day.items()})
    first_data = series[0].day if series else None
    hm = hr_max_for(s, end)
    n = 0
    for p in series:
        if p.day < start:
            continue
        v = per_day[p.day]
        _upsert_score(
            s,
            p.day,
            "strain",
            v["strain"],
            {
                "method": ld.METHOD,
                "band": ld.strain_band(v["strain"]),
                "trimp": v["trimp"],
                "step_trimp": v["step_trimp"],
                "steps": v["steps"],
                "workouts": v["workouts"],
                "hr_max": hm.value if hm else None,
                "scale": {"max": ld.STRAIN_MAX, "trimp_scale": ld.STRAIN_SCALE},
            },
        )
        history = (p.day - first_data).days if first_data else 0
        status, ratio = ld.load_status(p.atl, p.ctl, history)
        _upsert_score(
            s,
            p.day,
            "cardio_load",
            p.atl,
            {
                "method": ld.METHOD,
                "ctl": p.ctl,
                "atl": p.atl,
                "tsb": p.tsb,
                "ratio": ratio,
                "status": status,
                "optimal": [round(0.8 * p.ctl, 1), round(1.3 * p.ctl, 1)] if p.ctl else None,
                "history_days": history,
                "week_trimp": round(
                    sum(
                        per_day[p.day - timedelta(days=k)]["trimp"]
                        for k in range(7)
                        if p.day - timedelta(days=k) in per_day
                    ),
                    1,
                ),
            },
        )
        n += 1
    return n


# ---------------------------------------------------------------- stress + energy


def _utc_naive(local_naive: datetime) -> datetime:
    zone = ZoneInfo(settings.timezone)
    return local_naive.replace(tzinfo=zone).astimezone(UTC).replace(tzinfo=None)


def store_stress_energy(s: Session, d: date, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC).replace(tzinfo=None)
    zone = ZoneInfo(settings.timezone)
    day_lo = _utc_naive(datetime.combine(d, datetime.min.time()))
    day_hi = _end_of_local_day(d)
    sleep = s.execute(
        select(SleepSession).where(SleepSession.date == d, SleepSession.is_nap.is_(False))
    ).scalar_one_or_none()
    wake = (
        _utc_naive(sleep.end_ts)
        if sleep and sleep.end_ts
        else _utc_naive(datetime.combine(d, datetime.min.time()) + timedelta(hours=7))
    )
    asleep = []
    if sleep and sleep.start_ts and sleep.end_ts:
        asleep.append((_utc_naive(sleep.start_ts), _utc_naive(sleep.end_ts)))
    nxt = s.execute(
        select(SleepSession).where(
            SleepSession.date == d + timedelta(days=1), SleepSession.is_nap.is_(False)
        )
    ).scalar_one_or_none()
    bedtime = _utc_naive(nxt.start_ts) if nxt and nxt.start_ts else None
    if bedtime:
        asleep.append((bedtime, day_hi + timedelta(hours=12)))
    stress = [
        (r.ts, r.stress)
        for r in s.execute(
            select(StressSample)
            .where(StressSample.ts >= day_lo, StressSample.ts < day_hi)
            .order_by(StressSample.ts)
        ).scalars()
    ]
    summary = en.stress_summary(stress, asleep)
    daily = s.get(Daily, d)
    out: dict = {"stress": None, "energy": None}
    if summary.samples:
        _upsert_score(
            s,
            d,
            "stress",
            summary.mean_awake,
            {
                "method": "coros_stress_awake_mean",
                "high_minutes": summary.high_minutes,
                "samples": summary.samples,
                "coros_daily_avg": daily.stress_avg if daily else None,
            },
        )
        out["stress"] = summary.mean_awake

    end = min(now, bedtime or day_hi, day_hi)
    if end <= wake:
        return out
    rec = s.execute(
        select(Score).where(Score.date == d, Score.kind == "recovery")
    ).scalar_one_or_none()
    loads = s.execute(
        select(Score).where(Score.date == d, Score.kind == "strain")
    ).scalar_one_or_none()
    workouts = []
    for w in (loads.components or {}).get("workouts", []) if loads else []:
        ws = datetime.fromisoformat(w["start"]).astimezone(UTC).replace(tzinfo=None)
        we = datetime.fromisoformat(w["end"]).astimezone(UTC).replace(tzinfo=None)
        workouts.append((ws, we, w["trimp"]))
    pts, drains = en.energy_bank_detail(wake, end, rec.value if rec else None, stress, workouts)
    hourly = [p for i, p in enumerate(pts) if i % 6 == 0 or i == len(pts) - 1]
    _upsert_score(
        s,
        d,
        "energy",
        pts[-1].value,
        {
            "method": "energy_bank_v1",
            "start": pts[0].value,
            "start_source": "recovery" if rec else "default_70",
            "low": min(p.value for p in pts),
            "wake": wake.replace(tzinfo=UTC).isoformat(),
            "as_of": pts[-1].ts.replace(tzinfo=UTC).isoformat(),
            "timeline": [
                {"t": p.ts.replace(tzinfo=UTC).astimezone(zone).strftime("%H:%M"), "v": p.value}
                for p in hourly
            ],
            "workout_trimp": round(sum(w[2] for w in workouts), 1),
            "drains": drains,
        },
    )
    out["energy"] = pts[-1].value
    return out


STRESS_LEVELS = [(0, "Rest"), (26, "Low"), (51, "Medium"), (76, "High")]  # COROS's bands


def stress_day(s: Session, d: date) -> dict:
    """COROS stress samples for one local day (local times), sleep windows and minutes per
    level while awake."""
    zone = ZoneInfo(settings.timezone)
    day_lo = _utc_naive(datetime.combine(d, datetime.min.time()))
    day_hi = _end_of_local_day(d)
    rows = s.execute(
        select(StressSample)
        .where(StressSample.ts >= day_lo, StressSample.ts < day_hi)
        .order_by(StressSample.ts)
    ).scalars()
    samples = [(r.ts, r.stress) for r in rows if r.stress is not None and r.stress >= 0]

    def local(ts: datetime) -> str:
        return ts.replace(tzinfo=UTC).astimezone(zone).isoformat()

    sleeps = []
    for sd in (d, d + timedelta(days=1)):
        sl = s.execute(
            select(SleepSession).where(SleepSession.date == sd, SleepSession.is_nap.is_(False))
        ).scalar_one_or_none()
        if sl and sl.start_ts and sl.end_ts:
            sleeps.append((_utc_naive(sl.start_ts), _utc_naive(sl.end_ts)))
    minutes = {name: 0.0 for _, name in STRESS_LEVELS}
    for (ts, v), nxt in zip(samples, [*samples[1:], None], strict=False):
        if any(a <= ts < b for a, b in sleeps):
            continue
        dur = 5.0 if nxt is None else min(15.0, (nxt[0] - ts).total_seconds() / 60)
        name = [n for lo, n in STRESS_LEVELS if v >= lo][-1]
        minutes[name] += dur
    score = s.execute(
        select(Score).where(Score.date == d, Score.kind == "stress")
    ).scalar_one_or_none()
    return {
        "date": d.isoformat(),
        "samples": [{"t": local(ts), "v": v} for ts, v in samples],
        "asleep": [{"start": local(a), "end": local(b)} for a, b in sleeps],
        "levels": [
            {"name": n, "from": lo, "minutes": round(minutes[n])} for lo, n in STRESS_LEVELS
        ],
        "awake_mean": score.value if score else None,
        "high_minutes": (score.components or {}).get("high_minutes") if score else None,
    }


# ---------------------------------------------------------------- fitness models


def _upsert_fit(
    s: Session,
    d: date,
    metric: str,
    method: str,
    value: float,
    *,
    ci: tuple[float, float] | None = None,
    inputs: dict | None = None,
) -> None:
    row = s.execute(
        select(FitnessEstimate).where(
            FitnessEstimate.date == d,
            FitnessEstimate.metric == metric,
            FitnessEstimate.method == method,
        )
    ).scalar_one_or_none()
    if row is None:
        row = FitnessEstimate(date=d, metric=metric, method=method, value=value)
        s.add(row)
    row.value = value
    row.ci_low, row.ci_high = ci if ci else (None, None)
    row.inputs = inputs
    row.version = MODELS_VERSION


def compute_fitness(s: Session, d: date) -> dict:
    """Fitness models from the runs with FIT streams in the 90 days up to `d`."""
    hm = hr_max_for(s, d)
    lo = datetime.combine(d - timedelta(days=FITNESS_WINDOW_DAYS), datetime.min.time())
    hi = _end_of_local_day(d)
    runs = [
        a
        for a in s.execute(
            select(Activity).where(Activity.start_ts >= lo, Activity.start_ts < hi)
        ).scalars()
        if "run" in (a.sport or "").lower()
    ]
    result: dict = {"runs": len(runs), "runs_with_streams": 0, "hr_max": hm.value if hm else None}
    if hm is None:
        return result
    # recompute from scratch: an estimator that no longer applies (a deleted race) must go
    ours = ["vo2max", "critical_speed", "lthr", "threshold_pace", "hr_max"] + [
        k for k, _, _ in RACES_M
    ]
    s.execute(
        delete(FitnessEstimate).where(
            FitnessEstimate.date == d,
            FitnessEstimate.metric.in_(ours),
            FitnessEstimate.method != "coros",
        )
    )

    per_run_vo2: list[tuple[float, float]] = []
    run_info = []
    race_vdots: list[tuple[float, dict]] = []
    lower_bounds: list[tuple[float, dict]] = []
    cs_points: dict[int, tuple[float, float, int]] = {}
    friel: list[tuple[float, float, int]] = []
    floors: list[tuple[float, int]] = []
    all_windows: list[fit.Window] = []
    for a in runs:
        rows = _rows(_stream(s, a.id))
        if len(rows) < 600:
            continue
        result["runs_with_streams"] += 1
        day = _local_day(a.start_ts)
        rhr = _rhr_on(s, day)
        windows = fit.steady_windows(rows)
        all_windows += windows
        vo2 = fit.vo2max_from_windows(windows, rhr, hm.value) if rhr else None
        if vo2:
            per_run_vo2.append(((d - day).days, vo2))
        efforts = fit.best_efforts(rows)
        moving = sum(
            min(fit.GAP_S, b["t"] - a_["t"]) for a_, b in zip(rows, rows[1:], strict=False)
        )
        hit = fit.vdot_from_efforts(efforts, hm.value, moving)
        info = {"id": a.id, "date": day.isoformat(), "windows": len(windows), "vo2_hr_pace": vo2}
        if hit:
            v, e, race_like = hit
            meta = {
                "activity": a.id,
                "date": day.isoformat(),
                "distance_m": round(e.distance_m),
                "seconds": round(e.seconds),
                "avg_hr": round(e.avg_hr or 0),
            }
            (race_vdots if race_like else lower_bounds).append((v, meta))
            info["best_effort_vdot"] = v
            info["race_like"] = race_like
        for e in efforts:
            if e.kind == "time" and e.avg_hr and e.avg_hr >= 0.85 * hm.value:
                cur = cs_points.get(int(e.seconds))
                if cur is None or e.distance_m > cur[1]:
                    cs_points[int(e.seconds)] = (e.seconds, e.distance_m, a.id)
        fl = fit.lthr_floor(rows)
        if fl:
            floors.append((fl, a.id))
        fr = fit.friel_lthr(rows, hm.value)
        if fr:
            friel.append((fr[0], fr[1], a.id))
        run_info.append(info)
    result["per_run"] = run_info

    parts: list[fit.Estimate] = []
    hp = fit.combine_runs(per_run_vo2)
    if hp:
        parts.append(fit.Estimate("hr_pace", hp[0], hp[1], {"runs": hp[2]}))
    race = max(race_vdots, key=lambda x: x[0]) if race_vdots else None
    if race:
        parts.append(fit.Estimate("vdot_race", race[0], 2.0, race[1]))
    cs = fit.critical_speed(list(cs_points.values()))
    cs_vo2 = fit.vo2max_from_cs(cs) if cs else None
    if cs_vo2:
        parts.append(
            fit.Estimate("critical_speed", cs_vo2, 3.0, {"cs": cs.cs, "d_prime": cs.d_prime})
        )
    entered = race_results(s, d)
    if entered:
        v, r, sd = entered[0]
        parts.append(
            fit.Estimate(
                "race_result",
                v,
                sd,
                {"race": r.id, "date": r.date.isoformat(), "distance_m": r.distance_m},
            )
        )
        race = (v, {"race": r.id})  # an entered race outranks a race-like training effort
    lb = max(lower_bounds, key=lambda x: x[0]) if lower_bounds else None
    vo2 = fit.blend(parts)
    for p in parts:
        _upsert_fit(
            s,
            d,
            "vo2max",
            p.method,
            p.value,
            ci=(p.value - 1.96 * p.sd, p.value + 1.96 * p.sd),
            inputs=p.inputs,
        )
    if lb:
        _upsert_fit(s, d, "vo2max", "vdot_lower_bound", lb[0], inputs=lb[1])
    if vo2:
        _upsert_fit(
            s,
            d,
            "vo2max",
            "blend",
            vo2.value,
            ci=vo2.ci,
            inputs={"parts": {p.method: p.value for p in vo2.parts}, "hr_max": hm.value},
        )
    result["vo2max"] = vo2.value if vo2 else None
    result["vo2max_parts"] = {p.method: p.value for p in parts}
    result["vdot_lower_bound"] = lb[0] if lb else None
    if cs:
        _upsert_fit(
            s,
            d,
            "critical_speed",
            "ours",
            cs.cs,
            inputs={"d_prime": cs.d_prime, "r2": cs.r2, "n": cs.n},
        )

    # economy: race-like VDOT relative to the HR-pace estimate, when both exist
    economy = None
    if race and hp:
        economy = max(0.75, min(1.0, race[0] / hp[0]))
    pv = fit.prediction_vdot(
        hr_pace=hp[0] if hp else None,
        race_vdot=race[0] if race else None,
        cs_vo2=cs_vo2,
        lower_bound=lb[0] if lb else None,
        economy=economy,
    )
    if pv:
        for key, _, dist in RACES_M:
            t = fit.race_time(pv[0], dist)
            _upsert_fit(
                s,
                d,
                key,
                "ours",
                float(t),
                inputs={"vdot": pv[0], "method": pv[1], "economy": economy},
            )
        result["prediction_vdot"] = pv

    # LTHR + threshold pace
    lthr_parts: list[fit.Estimate] = []
    if friel:
        best = max(friel, key=lambda x: x[1])
        lthr_parts.append(
            fit.Estimate("friel", best[0], 3.0, {"activity": best[2], "speed": best[1]})
        )
    line = fit.hr_speed_line(all_windows)
    if line and cs:
        a_, b_, sd = line
        lthr_parts.append(
            fit.Estimate("hr_at_cs", round(a_ + b_ * cs.cs, 1), max(3.0, sd), {"cs": cs.cs})
        )
    prior = round(0.89 * hm.value, 1)
    floor = max(floors) if floors else None
    if floor and floor[0] > prior:
        lthr_parts.append(
            fit.Estimate(
                "effort_floor",
                floor[0],
                5.0,
                {"activity": floor[1], "ratio": fit.FLOOR_RATIO, "prior": prior},
            )
        )
    else:
        lthr_parts.append(fit.Estimate("prior", prior, 8.0, {"hr_max": hm.value}))
    lthr = fit.blend(lthr_parts)
    for p in lthr_parts:
        _upsert_fit(s, d, "lthr", p.method, p.value, inputs=p.inputs)
    _upsert_fit(
        s,
        d,
        "lthr",
        "blend",
        lthr.value,
        ci=lthr.ci,
        inputs={"parts": {p.method: p.value for p in lthr.parts}},
    )
    result["lthr"] = lthr.value
    result["lthr_parts"] = {p.method: p.value for p in lthr_parts}

    tp_speed, tp_method = None, None
    if cs:
        tp_speed, tp_method = cs.cs, "critical_speed"
    elif friel:
        tp_speed, tp_method = max(friel, key=lambda x: x[1])[1], "friel"
    elif line:
        a_, b_, _ = line
        tp_speed, tp_method = (lthr.value - a_) / b_, "hr_speed_line"
    if tp_speed:
        _upsert_fit(
            s, d, "threshold_pace", "ours", round(1000 / tp_speed, 1), inputs={"method": tp_method}
        )
    result["threshold_pace_s_per_km"] = round(1000 / tp_speed, 1) if tp_speed else None
    _upsert_fit(
        s,
        d,
        "hr_max",
        "estimate",
        float(hm.value),
        inputs={"method": hm.method, "candidates": hm.candidates},
    )
    return result


RACE_WINDOW_DAYS = 180


def race_results(s: Session, d: date) -> list[tuple[float, Race, float]]:
    """Entered races in the 180 days up to `d` as (VDOT, race, SD), most useful first: the
    SD grows 1 point per 60 days since the race, so an old PR gives way to a recent race."""
    rows = s.execute(
        select(Race).where(Race.date <= d, Race.date > d - timedelta(days=RACE_WINDOW_DAYS))
    ).scalars()
    out = []
    for r in rows:
        if not (1500 <= r.distance_m <= 42500) or r.time_s <= 0:
            continue
        v = fit.vdot(r.distance_m, r.time_s)
        out.append((v, r, round(1.5 + (d - r.date).days / 60, 2)))
    return sorted(out, key=lambda x: x[0] - 2 * x[2], reverse=True)


RACES_M = [
    ("race_5k", "5K", 5000.0),
    ("race_10k", "10K", 10000.0),
    ("race_hm", "Half marathon", 21097.5),
    ("race_m", "Marathon", 42195.0),
]


def latest_fitness(s: Session, d: date) -> dict[tuple[str, str], FitnessEstimate]:
    out: dict[tuple[str, str], FitnessEstimate] = {}
    for r in s.execute(
        select(FitnessEstimate).where(FitnessEstimate.date <= d).order_by(FitnessEstimate.date)
    ).scalars():
        out[(r.metric, r.method)] = r
    return out


# ---------------------------------------------------------------- biological age

MET_DEFAULT = {"walk": 3.5, "hike": 6.0, "bike": 7.0, "cycl": 7.0, "swim": 8.0, "strength": 5.0}


def _met_minutes(a: Activity) -> float:
    if not a.duration_s:
        return 0.0
    name = (a.sport or "").lower()
    if "run" in name and a.avg_pace_s_per_km:
        met = fit.acsm_vo2(1000 / a.avg_pace_s_per_km, 0.0) / 3.5
    else:
        met = next((v for k, v in MET_DEFAULT.items() if k in name), 5.0)
    return met * a.duration_s / 60


def compute_bioage(s: Session, d: date, *, require_vo2: bool = False) -> dict | None:
    """Bio age from the 30 days up to `d`. With `require_vo2`, skip days that have no VO₂max
    yet, so a history doesn't jump when the fitness term arrives."""
    user = _user(s)
    if user is None or user.dob is None:
        return None
    age = (d - user.dob).days / 365.25
    start = d - timedelta(days=30)
    dailies = s.execute(select(Daily).where(Daily.date > start, Daily.date <= d)).scalars().all()
    rhrs = [r.rhr for r in dailies if r.rhr]
    recs = (
        s.execute(
            select(Score).where(Score.date > start, Score.date <= d, Score.kind == "recovery")
        )
        .scalars()
        .all()
    )
    hrvs = [r.components.get("hrv_ms") for r in recs if r.components and r.components.get("hrv_ms")]
    sleeps = (
        s.execute(
            select(SleepSession).where(
                SleepSession.date > start, SleepSession.date <= d, SleepSession.is_nap.is_(False)
            )
        )
        .scalars()
        .all()
    )
    asleep = [x.asleep_s / 3600 for x in sleeps if x.asleep_s]
    scores = [
        r.value
        for r in s.execute(
            select(Score).where(Score.date > start, Score.date <= d, Score.kind == "sleep")
        ).scalars()
    ]
    lo = datetime.combine(d - timedelta(days=28), datetime.min.time())
    acts = (
        s.execute(
            select(Activity).where(
                Activity.start_ts >= lo, Activity.start_ts < _end_of_local_day(d)
            )
        )
        .scalars()
        .all()
    )
    met_week = sum(_met_minutes(a) for a in acts) / 4
    body = body_summary(s, d, 365)["metrics"]
    latest = latest_fitness(s, d)
    vo2_row = latest.get(("vo2max", "blend")) or latest.get(("vo2max", "coros"))
    if require_vo2 and vo2_row is None:
        return None
    inputs = bio.BioAgeInputs(
        age=age,
        sex=user.sex,
        vo2max=vo2_row.value if vo2_row else None,
        rhr=statistics.fmean(rhrs) if rhrs else None,
        hrv_ms=statistics.fmean(hrvs) if hrvs else None,
        bmi=(body["bmi"]["latest"] or {}).get("value"),
        body_fat_pct=(body["body_fat_pct"]["latest"] or {}).get("value"),
        sleep_h=statistics.fmean(asleep) if asleep else None,
        sleep_score=statistics.fmean(scores) if scores else None,
        met_min_week=round(met_week) if acts else None,
    )
    r = bio.bio_age(inputs)
    payload = {
        "method": bio.METHOD,
        "age": r.age,
        "delta": r.delta,
        "fitness_age": r.fitness_age,
        "contributions": r.contributions,
        "adjustments": r.adjustments,
        "inputs": {
            k: (round(v, 2) if isinstance(v, float) else v) for k, v in inputs.__dict__.items()
        },
        "vo2max_source": vo2_row.method if vo2_row else None,
        "window_days": 30,
        "norms": {
            "vo2max": round(bio.vo2_norm(age, user.sex), 1),
            "rhr": bio.RHR_NORM[bio.sex_key(user.sex)],
            "hrv_ms": round(max(15.0, 75 - 0.75 * age), 1),
            "bmi": [18.5, 25.0],
            "body_fat_pct": [None, 20.0 if bio.sex_key(user.sex) == "male" else 28.0],
            "sleep_h": [7.0, 9.0],
            "sleep_score": 70.0,
            "met_min_week": [500.0, 1000.0],
        },
    }
    _upsert_fit(s, d, "bio_age", "v1", r.value, inputs=payload)
    return {"value": r.value, **payload}


def compute_models(s: Session, end: date, start: date | None = None) -> dict:
    """Everything in this module for [start, end]; fitness models and bio age for `end`."""
    start = start or end
    n = store_load_scores(s, start, end)
    d = start
    while d <= end:
        store_stress_energy(s, d)
        d += timedelta(days=1)
    # weekly history (Mondays) so VO2max, LTHR and bio age have trends, then `end` itself
    weekly = 0
    d = start + timedelta(days=(7 - start.weekday()) % 7)
    while d < end:
        compute_fitness(s, d)
        weekly += compute_bioage(s, d, require_vo2=True) is not None
        d += timedelta(days=7)
    f = compute_fitness(s, end)
    b = compute_bioage(s, end)
    return {"days": n, "fitness": f, "bio_age": b, "weekly_bio_age": weekly}
