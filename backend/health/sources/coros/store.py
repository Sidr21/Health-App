"""Persist parsed COROS payloads. Idempotent upserts keyed on natural keys."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from health.config import settings
from health.models import (
    Activity,
    ActivityLap,
    Daily,
    HrvSample,
    SleepSession,
    StressSample,
    SyncLog,
    User,
)
from health.sources.coros import parsers as p


def save_raw(kind: str, payload: str, *, suffix: str = "txt") -> Path:
    d = settings.raw_dir / "coros" / kind
    d.mkdir(parents=True, exist_ok=True)
    path = d / f"{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}.{suffix}"
    path.write_text(payload)
    return path


def _get_daily(s: Session, d: date) -> Daily:
    row = s.get(Daily, d)
    if row is None:
        row = Daily(date=d)
        s.add(row)
    return row


def log(s: Session, kind: str, ok: bool = True, detail: str | None = None) -> None:
    s.add(SyncLog(ts=datetime.now(UTC), source="coros", kind=kind, ok=ok, detail=detail))


# ---------------------------------------------------------------- activities


def store_sport_records(s: Session, records: list[p.SportRecord]) -> int:
    n = 0
    for r in records:
        row = s.execute(
            select(Activity).where(Activity.source == "coros", Activity.external_id == r.label_id)
        ).scalar_one_or_none()
        if row is None:
            row = Activity(
                source="coros",
                external_id=r.label_id,
                sport=r.sport_name,
                start_ts=datetime.now(UTC),
            )
            s.add(row)
            n += 1
        row.sport = r.sport_name
        row.sport_code = r.sport_type
        if r.start_ts:
            row.start_ts = datetime.fromtimestamp(r.start_ts, UTC).replace(tzinfo=None)
        else:
            row.start_ts = datetime.combine(r.date, datetime.min.time())
        row.end_ts = (
            datetime.fromtimestamp(r.end_ts, UTC).replace(tzinfo=None) if r.end_ts else None
        )
        row.duration_s = r.duration_s
        row.distance_m = r.distance_m
        row.avg_hr = r.avg_hr
        row.avg_pace_s_per_km = r.avg_pace_s_per_km
        row.calories = r.calories
        row.location = r.location
        raw = dict(row.raw_json or {})
        raw["record"] = {k: (str(v) if isinstance(v, date) else v) for k, v in r.__dict__.items()}
        row.raw_json = raw
    return n


def store_activity_detail(s: Session, label_id: str, detail: dict) -> None:
    row = s.execute(
        select(Activity).where(Activity.source == "coros", Activity.external_id == label_id)
    ).scalar_one_or_none()
    if row is None:
        return
    row.coros_training_load = detail.get("training_load")
    row.coros_aerobic_te = detail.get("aerobic_te")
    row.coros_anaerobic_te = detail.get("anaerobic_te")
    row.avg_power_w = detail.get("avg_power_w") or row.avg_power_w
    row.elev_gain_m = detail.get("elev_gain_m") or row.elev_gain_m
    raw = dict(row.raw_json or {})
    raw["detail"] = detail
    row.raw_json = raw


def store_laps(s: Session, label_id: str, laps: list[dict]) -> int:
    row = s.execute(
        select(Activity).where(Activity.source == "coros", Activity.external_id == label_id)
    ).scalar_one_or_none()
    if row is None:
        return 0
    for old in s.execute(select(ActivityLap).where(ActivityLap.activity_id == row.id)).scalars():
        s.delete(old)
    n = 0
    for lap in laps:
        if lap.get("group_type") == -1:  # whole-activity summary group
            row.max_hr = lap.get("maxHr") or row.max_hr
            continue
        s.add(
            ActivityLap(
                activity_id=row.id,
                idx=int(lap.get("lapIndex", n + 1)),
                start_offset_s=(lap.get("totalLength") or 0) - (lap.get("time") or 0),
                duration_s=lap.get("time"),
                distance_m=(lap.get("distance") or 0) / 100.0 if lap.get("distance") else None,
                avg_hr=lap.get("avgHr"),
                max_hr=lap.get("maxHr"),
                avg_pace_s_per_km=lap.get("avgPace"),
                avg_power_w=lap.get("avgPower"),
                avg_cadence=lap.get("avgCadence"),
                raw_json=lap,
            )
        )
        n += 1
    return n


# ---------------------------------------------------------------- daily


def store_rhr(s: Session, values: dict[date, int | None]) -> int:
    n = 0
    for d, v in values.items():
        if v is None:
            continue
        _get_daily(s, d).rhr = v
        n += 1
    return n


def store_avg_hr(s: Session, values: dict[date, int | None]) -> int:
    n = 0
    for d, v in values.items():
        if v is None:
            continue
        _get_daily(s, d).avg_hr = v
        n += 1
    return n


def store_daily_health(s: Session, rep: p.DailyHealthReport) -> int:
    for day in rep.days:
        row = _get_daily(s, day.date)
        row.steps = day.steps
        row.calories = day.calories
        row.exercise_min = day.exercise_min
        row.stress_avg = day.stress_avg if day.stress_avg is not None else row.stress_avg
        raw = dict(row.raw_json or {})
        raw["daily_health"] = {k: v for k, v in day.__dict__.items() if k != "date"}
        row.raw_json = raw
        if day.sleep_total_s:
            sl = _main_sleep(s, day.date)
            sl.deep_s = day.sleep_deep_s
            sl.light_s = day.sleep_light_s
            sl.rem_s = day.sleep_rem_s
            sl.awake_s = day.sleep_awake_s if sl.awake_s is None else sl.awake_s
            sl.in_bed_s = day.sleep_total_s
            sl.hr_avg, sl.hr_min, sl.hr_max = day.sleep_hr_avg, day.sleep_hr_min, day.sleep_hr_max
    return len(rep.days)


def _main_sleep(s: Session, d: date) -> SleepSession:
    row = s.execute(
        select(SleepSession).where(SleepSession.date == d, SleepSession.is_nap.is_(False))
    ).scalar_one_or_none()
    if row is None:
        row = SleepSession(date=d, is_nap=False)
        s.add(row)
        s.flush()
    return row


def store_sleep_overview(s: Session, nights: list[p.SleepOverview]) -> int:
    for n in nights:
        row = _main_sleep(s, n.date)
        row.coros_score = n.score
        row.asleep_s = n.main_asleep_s
        row.in_bed_s = n.main_period_s or row.in_bed_s
        row.awake_s = n.awake_s
        row.awake_count = n.awake_count
        row.start_ts, row.end_ts = n.window_start, n.window_end
        if row.asleep_s and n.deep_pct is not None:
            row.deep_s = row.deep_s or int(row.asleep_s * n.deep_pct / 100)
            row.rem_s = row.rem_s or int(row.asleep_s * (n.rem_pct or 0) / 100)
            row.light_s = row.light_s or int(row.asleep_s * (n.light_pct or 0) / 100)
        raw = dict(row.raw_json or {})
        raw["overview"] = {
            k: (v.isoformat() if isinstance(v, datetime | date) else v)
            for k, v in n.__dict__.items()
        }
        row.raw_json = raw
    return len(nights)


def store_sleep_hrv(s: Session, rep: p.SleepHrvReport) -> int:
    existing = {
        (r.ts, r.context): r
        for r in s.execute(select(HrvSample).where(HrvSample.context == "sleep")).scalars()
    }
    n = 0
    for pt in rep.points:
        ts = datetime.fromtimestamp(pt.ts, UTC).replace(tzinfo=None)
        if (ts, "sleep") in existing:
            continue
        s.add(
            HrvSample(
                ts=ts,
                date=pt.date,
                rmssd_ms=float(pt.hrv_ms),
                confidence=pt.confidence,
                context="sleep",
            )
        )
        n += 1
    for a in rep.assessments:
        row = _get_daily(s, a.date)
        raw = dict(row.raw_json or {})
        raw["coros_hrv"] = a.__dict__ | {"date": a.date.isoformat()}
        row.raw_json = raw
    return n


def store_stress_days(s: Session, days: list[p.StressDay]) -> int:
    for d in days:
        if d.avg is not None:
            _get_daily(s, d.date).stress_avg = d.avg
    return len(days)


def store_stress_series(s: Session, points: list[p.StressPoint]) -> int:
    existing = {r.ts for r in s.execute(select(StressSample)).scalars()}
    n = 0
    for pt in points:
        ts = datetime.fromtimestamp(pt.ts, UTC).replace(tzinfo=None)
        if ts in existing:
            continue
        s.add(
            StressSample(
                ts=ts,
                stress=pt.stress,
                score=pt.score,
                stress_hrv=pt.stress_hrv,
                stress_hr=pt.stress_hr,
            )
        )
        n += 1
    return n


def store_training_load(s: Session, days: list[p.LoadDay]) -> int:
    for d in days:
        row = _get_daily(s, d.date)
        row.coros_stl, row.coros_ltl, row.coros_load_ratio = d.stl, d.ltl, d.ratio
        row.coros_load_comment = d.comment
    return len(days)


def store_recovery(s: Session, d: date, rec: dict) -> None:
    row = _get_daily(s, d)
    row.coros_recovery_pct = rec.get("recovery_pct")
    raw = dict(row.raw_json or {})
    raw["coros_recovery"] = rec
    row.raw_json = raw


def store_fitness(s: Session, d: date, fit: dict) -> None:
    from health.models import FitnessEstimate

    for metric, key in [
        ("vo2max", "vo2max"),
        ("threshold_pace", "threshold_pace_s_per_km"),
        ("race_5k", "pred_5k_s"),
        ("race_10k", "pred_10k_s"),
        ("race_hm", "pred_half_s"),
        ("race_m", "pred_marathon_s"),
    ]:
        val = fit.get(key)
        if val is None:
            continue
        row = s.execute(
            select(FitnessEstimate).where(
                FitnessEstimate.date == d,
                FitnessEstimate.metric == metric,
                FitnessEstimate.method == "coros",
            )
        ).scalar_one_or_none()
        if row is None:
            row = FitnessEstimate(date=d, metric=metric, method="coros", value=float(val))
            s.add(row)
        row.value = float(val)
        row.coros_value = float(val)


def store_user(s: Session, info: dict) -> User:
    user = s.execute(select(User)).scalars().first()
    if user is None:
        user = User(name=info.get("nickname") or "me")
        s.add(user)
    user.sex = info.get("sex") or user.sex
    user.dob = info.get("dob") or user.dob
    user.height_cm = info.get("height_cm") or user.height_cm
    if info.get("weight_kg"):
        from health.models import BodyMetric

        ts = datetime.now(UTC).replace(tzinfo=None)
        key = f"profile:{ts.date().isoformat()}"
        exists = s.execute(
            select(BodyMetric).where(BodyMetric.source == "coros", BodyMetric.external_id == key)
        ).scalar_one_or_none()
        if exists is None:
            s.add(
                BodyMetric(
                    ts=ts,
                    source="coros",
                    external_id=key,
                    metric="weight_kg",
                    value=float(info["weight_kg"]),
                    unit="kg",
                )
            )
    return user


def import_text(s: Session, kind: str, text: str, *, label_id: str | None = None) -> int:
    """Route a raw tool output to the right parser + store. `kind` = tool name without prefix."""
    if text.startswith('"') and text.rstrip().endswith('"'):
        text = json.loads(text) if "\\n" in text else text.strip()[1:-1]
    save_raw(kind, text, suffix="json" if kind == "queryActivityLapData" else "txt")
    match kind:
        case "querySportRecords":
            return store_sport_records(s, p.parse_sport_records(text))
        case "queryRestingHeartRate":
            return store_rhr(s, p.parse_dated_values(text))
        case "queryAvgHeartRate":
            return store_avg_hr(s, p.parse_dated_values(text))
        case "queryDailyHealthData":
            return store_daily_health(s, p.parse_daily_health(text))
        case "querySleepOverview":
            return store_sleep_overview(s, p.parse_sleep_overview(text))
        case "querySleepHrv":
            return store_sleep_hrv(s, p.parse_sleep_hrv(text))
        case "queryStressLevel":
            return store_stress_days(s, p.parse_stress_level(text))
        case "queryStressTimeSeries":
            return store_stress_series(s, p.parse_stress_series(text))
        case "queryTrainingLoadAssessment":
            return store_training_load(s, p.parse_training_load(text))
        case "queryRecoveryStatus":
            store_recovery(s, date.today(), p.parse_recovery_status(text))
            return 1
        case "queryFitnessAssessmentOverview":
            store_fitness(s, date.today(), p.parse_fitness_assessment(text))
            return 1
        case "queryUserInfo":
            store_user(s, p.parse_user_info(text))
            return 1
        case "getActivityDetail":
            if not label_id:
                raise ValueError("label_id required for getActivityDetail")
            store_activity_detail(s, label_id, p.parse_activity_detail(text))
            return 1
        case "queryActivityLapData":
            if not label_id:
                raise ValueError("label_id required for queryActivityLapData")
            return store_laps(s, label_id, p.parse_lap_data(text))
    raise ValueError(f"unknown kind {kind}")
