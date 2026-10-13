import type { BodyMetricOut, BodySummary } from "./api";
import { getUnits } from "./units";

export type BodyKey = keyof BodySummary["metrics"];

const LB = 2.20462262;

/** Display value + unit for a stored body metric (kg / cm stored). */
export function bodyValue(key: BodyKey, v: number | null | undefined): { value: string; unit: string } {
  if (v == null) return { value: "–", unit: "" };
  const imperial = getUnits() === "imperial";
  if (key === "weight_kg" || key === "lean_mass_kg") {
    return imperial ? { value: (v * LB).toFixed(1), unit: "lb" } : { value: v.toFixed(1), unit: "kg" };
  }
  if (key === "waist_cm") return imperial ? { value: (v / 2.54).toFixed(1), unit: "in" } : { value: v.toFixed(1), unit: "cm" };
  if (key === "body_fat_pct") return { value: v.toFixed(1), unit: "%" };
  return { value: v.toFixed(1), unit: "" };
}

export function bodyDelta(key: BodyKey, d: number | null | undefined): string | null {
  if (d == null) return null;
  const { value, unit } = bodyValue(key, Math.abs(d));
  if (Number(value) === 0) return "No change in 30 days";
  return `${d > 0 ? "▲" : "▼"} ${value}${unit ? ` ${unit}` : ""} in 30 days`;
}

export function bmiCategory(bmi: number | null | undefined): string | null {
  if (bmi == null) return null;
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy range";
  if (bmi < 30) return "Overweight";
  return "Obese range";
}

export function displaySeries(key: BodyKey, m: BodyMetricOut): number[] {
  return m.series.map((p) => Number(bodyValue(key, p.value).value));
}
