import { useQuery } from "@tanstack/react-query";

import { api, type MuscleId, type MuscleStateOut, type MuscleStatus } from "./api";
import { weightUnit } from "./units";
import { todayIso } from "./useDays";
import { colors } from "@/theme/tokens";

export const KG_PER_LB = 0.45359237;
export function toUnit(kg: number, unit = weightUnit()): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

export function weight(kg: number | null | undefined, unit = weightUnit()): string {
  if (kg == null) return "–";
  const v = toUnit(kg, unit);
  return `${(v >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString()} ${unit}`;
}

export const statusColor: Record<MuscleStatus, string> = {
  recovered: colors.recovery,
  fatigued: colors.recoveryAmber,
  depleted: colors.recoveryRed,
};

export const statusLabel: Record<MuscleStatus, string> = {
  recovered: "Recovered",
  fatigued: "Fatigued",
  depleted: "Depleted",
};

export type MapMode = "freshness" | "load" | "volume";

export interface MuscleFill {
  color: string;
  opacity: number;
}

/** Body-map colours for one mode. Untouched muscles get no fill (drawn as the base tone). */
export function fillsFor(muscles: MuscleStateOut[], mode: MapMode): Partial<Record<MuscleId, MuscleFill>> {
  const out: Partial<Record<MuscleId, MuscleFill>> = {};
  if (mode === "freshness") {
    for (const m of muscles) {
      if (m.freshness >= 99) continue;
      // recovered muscles get a faint tint so only fatigued/depleted ones really stand out
      const opacity =
        m.status === "recovered"
          ? 0.18 + 0.2 * ((100 - m.freshness) / 20)
          : m.status === "fatigued"
            ? 0.6 + 0.25 * ((80 - m.freshness) / 30)
            : 0.88 + 0.12 * Math.min(1, (50 - m.freshness) / 50);
      out[m.id] = { color: statusColor[m.status], opacity };
    }
    return out;
  }
  const key = mode === "load" ? "load_7d" : "volume_7d_kg";
  const max = Math.max(0, ...muscles.map((m) => m[key]));
  if (max <= 0) return out;
  const color = mode === "load" ? colors.strain : colors.muscular;
  for (const m of muscles) {
    if (m[key] <= 0) continue;
    out[m.id] = { color, opacity: 0.25 + 0.75 * (m[key] / max) };
  }
  return out;
}

export function useStrength(date = todayIso()) {
  return useQuery({ queryKey: ["strength", date], queryFn: () => api.strength(date) });
}

export function relativeDay(iso: string | null): string {
  if (!iso) return "not trained recently";
  // calendar days, not 24-hour periods: last night's run is "yesterday" even 20 hours later
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}
