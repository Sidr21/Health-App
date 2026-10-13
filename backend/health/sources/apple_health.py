"""Ingest HealthKit samples posted by the app (DESIGN §3.3)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from health.models import BodyMetric

# HKQuantityTypeIdentifier -> (metric, canonical unit)
TYPE_MAP: dict[str, tuple[str, str]] = {
    "HKQuantityTypeIdentifierBodyMass": ("weight_kg", "kg"),
    "HKQuantityTypeIdentifierBodyMassIndex": ("bmi", "count"),
    "HKQuantityTypeIdentifierBodyFatPercentage": ("body_fat_pct", "%"),
    "HKQuantityTypeIdentifierLeanBodyMass": ("lean_mass_kg", "kg"),
    "HKQuantityTypeIdentifierHeight": ("height_cm", "cm"),
    "HKQuantityTypeIdentifierWaistCircumference": ("waist_cm", "cm"),
    "HKQuantityTypeIdentifierBloodPressureSystolic": ("bp_sys", "mmHg"),
    "HKQuantityTypeIdentifierBloodPressureDiastolic": ("bp_dia", "mmHg"),
    "HKQuantityTypeIdentifierOxygenSaturation": ("spo2_pct", "%"),
    "HKQuantityTypeIdentifierRespiratoryRate": ("resp_rate", "count/min"),
    "HKQuantityTypeIdentifierVO2Max": ("vo2max_apple", "mL/kg/min"),
    "HKQuantityTypeIdentifierDietaryEnergyConsumed": ("kcal_in", "kcal"),
    "HKQuantityTypeIdentifierDietaryWater": ("water_ml", "mL"),
    "HKQuantityTypeIdentifierDietaryCaffeine": ("caffeine_mg", "mg"),
}

_UNIT_FACTORS = {  # (from unit, to unit) -> multiplier
    ("lb", "kg"): 0.45359237,
    ("g", "kg"): 0.001,
    ("m", "cm"): 100.0,
    ("in", "cm"): 2.54,
    ("ft", "cm"): 30.48,
    ("L", "mL"): 1000.0,
    ("fl_oz_us", "mL"): 29.5735,
}


class HKSample(BaseModel):
    type: str
    uuid: str
    start: datetime
    end: datetime | None = None
    value: float
    unit: str
    source: str = Field(default="unknown", description="bundle id of the writing app")


class HKPayload(BaseModel):
    samples: list[HKSample]


def _normalise(value: float, unit: str, target: str) -> float | None:
    if unit == target:
        return value
    if unit == "%" and target == "%":
        return value
    if target == "%" and unit in ("", "fraction"):
        return value * 100
    f = _UNIT_FACTORS.get((unit, target))
    return value * f if f else None


def ingest(s: Session, payload: HKPayload) -> dict[str, int]:
    stored = skipped = unknown = 0
    for smp in payload.samples:
        mapping = TYPE_MAP.get(smp.type)
        if mapping is None:
            unknown += 1
            continue
        metric, unit = mapping
        val = _normalise(smp.value, smp.unit, unit)
        if val is None:
            skipped += 1
            continue
        if metric == "body_fat_pct" and val <= 1.0:
            val *= 100  # HealthKit stores percentages as fractions
        source = f"apple:{smp.source}"
        exists = s.execute(
            select(BodyMetric).where(
                BodyMetric.source == source, BodyMetric.external_id == smp.uuid
            )
        ).scalar_one_or_none()
        if exists:
            skipped += 1
            continue
        s.add(
            BodyMetric(
                ts=smp.start.replace(tzinfo=None),
                source=source,
                external_id=smp.uuid,
                metric=metric,
                value=float(val),
                unit=unit,
            )
        )
        stored += 1
    return {"stored": stored, "skipped": skipped, "unknown_type": unknown}
