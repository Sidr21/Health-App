/** Typed views of the engine's score components (backend compute_models.py). */
import type { DayPayload } from "@/lib/api";

export interface StrainWorkout {
  id: number;
  sport: string;
  sport_code?: number | null;
  start: string;
  end: string;
  trimp: number;
  method: "stream" | "avg_hr" | "coros_load" | "none";
  strain: number;
  steps: number;
}

export interface StrainComps {
  method: string;
  band: string;
  trimp: number;
  step_trimp: number;
  steps: number | null;
  workouts: StrainWorkout[];
  hr_max: number | null;
  scale: number;
}

export interface CardioComps {
  ctl: number;
  atl: number;
  tsb: number;
  ratio: number | null;
  status: string;
  optimal: [number, number] | null;
  history_days: number;
  week_trimp: number;
}

export interface EnergyComps {
  start: number;
  start_source: "recovery" | "default_70";
  low: number;
  wake: string;
  as_of: string;
  timeline: { t: string; v: number }[];
  workout_trimp: number;
  drains?: { awake: number; stress: number; calm: number; workouts: number };
}

export interface StressComps {
  high_minutes: number;
  samples: number;
  coros_daily_avg: number | null;
}

export function comps<T>(d: DayPayload | undefined, kind: keyof DayPayload["scores"]): T | null {
  return (d?.scores[kind]?.components as T | undefined) ?? null;
}

/** "HH:MM" → minutes since midnight, rolling past midnight when the clock wraps. */
export function clockMinutes(times: string[]): number[] {
  let offset = 0;
  let prev = -1;
  return times.map((t) => {
    const [h, m] = t.split(":").map(Number);
    let v = h * 60 + m + offset;
    if (v < prev) {
      offset += 24 * 60;
      v += 24 * 60;
    }
    prev = v;
    return v;
  });
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export const METHOD_LABEL: Record<StrainWorkout["method"], string> = {
  stream: "per-second HR",
  avg_hr: "average HR",
  coros_load: "COROS load",
  none: "no HR",
};

export function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
