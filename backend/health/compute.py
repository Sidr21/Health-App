"""Turn stored raw data into scores (DB-aware glue around the pure engine)."""

from __future__ import annotations

import math
import statistics
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from health.engine.baselines import rolling_baseline
from health.engine.hrv import nightly_hrv
from health.engine.recovery import RecoveryInputs, recovery_score
from health.engine.sleep import SleepInputs, sleep_score
from health.models import Daily, HrvSample, Score, SleepSession

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
    return out


def compute_range(s: Session, start: date, end: date) -> int:
    n = 0
    d = start
    while d <= end:
        compute_day(s, d)
        n += 1
        d += timedelta(days=1)
    return n
