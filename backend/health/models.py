"""SQLAlchemy models. Mirrors docs/DESIGN.md §5."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    sex: Mapped[str | None] = mapped_column(String(10))
    dob: Mapped[date | None] = mapped_column(Date)
    height_cm: Mapped[float | None] = mapped_column(Float)
    hr_max: Mapped[int | None] = mapped_column(Integer)
    hr_max_source: Mapped[str | None] = mapped_column(String(20))  # user|field_test|estimated
    units: Mapped[str] = mapped_column(String(10), default="imperial")
    tz: Mapped[str] = mapped_column(String(40), default="America/New_York")


class Activity(Base):
    __tablename__ = "activities"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_activity_source_ext"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    source: Mapped[str] = mapped_column(String(10))  # coros|apple
    external_id: Mapped[str] = mapped_column(String(40))
    sport: Mapped[str] = mapped_column(String(40))
    sport_code: Mapped[int | None] = mapped_column(Integer)
    start_ts: Mapped[datetime] = mapped_column(DateTime)
    end_ts: Mapped[datetime | None] = mapped_column(DateTime)
    duration_s: Mapped[int | None] = mapped_column(Integer)
    distance_m: Mapped[float | None] = mapped_column(Float)
    avg_hr: Mapped[int | None] = mapped_column(Integer)
    max_hr: Mapped[int | None] = mapped_column(Integer)
    avg_pace_s_per_km: Mapped[float | None] = mapped_column(Float)
    avg_power_w: Mapped[float | None] = mapped_column(Float)
    elev_gain_m: Mapped[float | None] = mapped_column(Float)
    calories: Mapped[int | None] = mapped_column(Integer)
    location: Mapped[str | None] = mapped_column(String(120))
    coros_training_load: Mapped[float | None] = mapped_column(Float)
    coros_aerobic_te: Mapped[float | None] = mapped_column(Float)
    coros_anaerobic_te: Mapped[float | None] = mapped_column(Float)
    raw_json: Mapped[dict | None] = mapped_column(JSON)
    fit_path: Mapped[str | None] = mapped_column(String(255))


class ActivitySample(Base):
    __tablename__ = "activity_samples"
    __table_args__ = (Index("ix_samples_activity_t", "activity_id", "t_offset_s"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"))
    t_offset_s: Mapped[int] = mapped_column(Integer)
    hr: Mapped[int | None] = mapped_column(Integer)
    speed_mps: Mapped[float | None] = mapped_column(Float)
    distance_m: Mapped[float | None] = mapped_column(Float)
    cadence: Mapped[int | None] = mapped_column(Integer)
    power_w: Mapped[int | None] = mapped_column(Integer)
    alt_m: Mapped[float | None] = mapped_column(Float)
    lat: Mapped[float | None] = mapped_column(Float)
    lon: Mapped[float | None] = mapped_column(Float)
    grade: Mapped[float | None] = mapped_column(Float)


class ActivityLap(Base):
    __tablename__ = "activity_laps"
    id: Mapped[int] = mapped_column(primary_key=True)
    activity_id: Mapped[int] = mapped_column(ForeignKey("activities.id", ondelete="CASCADE"))
    idx: Mapped[int] = mapped_column(Integer)
    start_offset_s: Mapped[float | None] = mapped_column(Float)
    duration_s: Mapped[float | None] = mapped_column(Float)
    distance_m: Mapped[float | None] = mapped_column(Float)
    avg_hr: Mapped[int | None] = mapped_column(Integer)
    max_hr: Mapped[int | None] = mapped_column(Integer)
    avg_pace_s_per_km: Mapped[float | None] = mapped_column(Float)
    avg_power_w: Mapped[float | None] = mapped_column(Float)
    avg_cadence: Mapped[int | None] = mapped_column(Integer)
    raw_json: Mapped[dict | None] = mapped_column(JSON)


class Daily(Base):
    __tablename__ = "daily"
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    steps: Mapped[int | None] = mapped_column(Integer)
    calories: Mapped[int | None] = mapped_column(Integer)
    exercise_min: Mapped[int | None] = mapped_column(Integer)
    avg_hr: Mapped[int | None] = mapped_column(Integer)
    rhr: Mapped[int | None] = mapped_column(Integer)
    stress_avg: Mapped[int | None] = mapped_column(Integer)
    coros_hrv_avg: Mapped[int | None] = mapped_column(Integer)  # COROS nightly avg, fallback
    coros_recovery_pct: Mapped[int | None] = mapped_column(Integer)
    coros_stl: Mapped[float | None] = mapped_column(Float)
    coros_ltl: Mapped[float | None] = mapped_column(Float)
    coros_load_ratio: Mapped[float | None] = mapped_column(Float)
    coros_load_comment: Mapped[str | None] = mapped_column(String(40))
    raw_json: Mapped[dict | None] = mapped_column(JSON)


class SleepSession(Base):
    __tablename__ = "sleep_sessions"
    __table_args__ = (UniqueConstraint("date", "is_nap", "start_ts", name="uq_sleep"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date)  # wake-up day
    start_ts: Mapped[datetime | None] = mapped_column(DateTime)
    end_ts: Mapped[datetime | None] = mapped_column(DateTime)
    asleep_s: Mapped[int | None] = mapped_column(Integer)
    in_bed_s: Mapped[int | None] = mapped_column(Integer)
    deep_s: Mapped[int | None] = mapped_column(Integer)
    light_s: Mapped[int | None] = mapped_column(Integer)
    rem_s: Mapped[int | None] = mapped_column(Integer)
    awake_s: Mapped[int | None] = mapped_column(Integer)
    awake_count: Mapped[int | None] = mapped_column(Integer)
    hr_avg: Mapped[int | None] = mapped_column(Integer)
    hr_min: Mapped[int | None] = mapped_column(Integer)
    hr_max: Mapped[int | None] = mapped_column(Integer)
    coros_score: Mapped[int | None] = mapped_column(Integer)
    is_nap: Mapped[bool] = mapped_column(default=False)
    raw_json: Mapped[dict | None] = mapped_column(JSON)


class HrvSample(Base):
    __tablename__ = "hrv_samples"
    __table_args__ = (UniqueConstraint("ts", "context", name="uq_hrv_ts_ctx"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    date: Mapped[date] = mapped_column(Date, index=True)  # wake-up day for sleep context
    rmssd_ms: Mapped[float] = mapped_column(Float)
    confidence: Mapped[int | None] = mapped_column(Integer)  # 0..100000 from COROS
    context: Mapped[str] = mapped_column(String(10))  # sleep|stress|check


class StressSample(Base):
    __tablename__ = "stress_samples"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, unique=True)
    stress: Mapped[int] = mapped_column(Integer)
    score: Mapped[int | None] = mapped_column(Integer)
    stress_hrv: Mapped[int | None] = mapped_column(Integer)
    stress_hr: Mapped[int | None] = mapped_column(Integer)


class BodyMetric(Base):
    __tablename__ = "body_metrics"
    __table_args__ = (UniqueConstraint("source", "external_id", name="uq_body_source_ext"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime, index=True)
    source: Mapped[str] = mapped_column(String(40))  # apple:<bundle id> | coros
    external_id: Mapped[str | None] = mapped_column(String(64))
    metric: Mapped[str] = mapped_column(String(40), index=True)
    value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(16))


class JournalEntry(Base):
    __tablename__ = "journal"
    __table_args__ = (UniqueConstraint("date", "tag", name="uq_journal_date_tag"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    tag: Mapped[str] = mapped_column(String(40))
    value: Mapped[float | None] = mapped_column(Float)  # 1/0 for booleans
    note: Mapped[str | None] = mapped_column(String(500))


class Score(Base):
    __tablename__ = "scores"
    __table_args__ = (UniqueConstraint("date", "kind", name="uq_score_date_kind"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(20))  # recovery|sleep|strain|stress|energy
    value: Mapped[float] = mapped_column(Float)
    components: Mapped[dict | None] = mapped_column(JSON)
    version: Mapped[int] = mapped_column(Integer, default=1)


class FitnessEstimate(Base):
    __tablename__ = "fitness"
    __table_args__ = (UniqueConstraint("date", "metric", "method", name="uq_fitness"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    metric: Mapped[str] = mapped_column(String(30))
    method: Mapped[str] = mapped_column(String(30))
    value: Mapped[float] = mapped_column(Float)
    ci_low: Mapped[float | None] = mapped_column(Float)
    ci_high: Mapped[float | None] = mapped_column(Float)
    inputs: Mapped[dict | None] = mapped_column(JSON)
    coros_value: Mapped[float | None] = mapped_column(Float)
    version: Mapped[int] = mapped_column(Integer, default=1)


class SyncLog(Base):
    __tablename__ = "sync_log"
    id: Mapped[int] = mapped_column(primary_key=True)
    ts: Mapped[datetime] = mapped_column(DateTime)
    source: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(40))
    ok: Mapped[bool] = mapped_column(default=True)
    detail: Mapped[str | None] = mapped_column(String(500))
