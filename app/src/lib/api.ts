/** Typed client for the backend (backend/health/api/main.py). */
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? "http://localhost:8000").replace(/\/$/, "");
const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN ?? extra.apiToken ?? "";

export type Band = "green" | "amber" | "red";

export interface ScoreEntry {
  value: number;
  components: Record<string, unknown> | null;
}

export interface DayPayload {
  date: string;
  scores: Partial<Record<"recovery" | "sleep" | "strain" | "stress" | "energy", ScoreEntry>>;
  daily: {
    steps: number | null;
    calories: number | null;
    rhr: number | null;
    stress_avg: number | null;
    stress_min: number | null;
    stress_max: number | null;
    stress_updated: string | null;
    coros_recovery_pct: number | null;
    coros_stl: number | null;
    coros_ltl: number | null;
    coros_load_ratio: number | null;
    coros_load_comment: string | null;
  };
  sleep: {
    start: string | null;
    end: string | null;
    asleep_s: number | null;
    in_bed_s: number | null;
    deep_s: number | null;
    light_s: number | null;
    rem_s: number | null;
    awake_s: number | null;
    awake_count: number | null;
    hr_avg: number | null;
    hr_min: number | null;
    coros_score: number | null;
  } | null;
  activities: {
    id: number;
    sport: string;
    sport_code: number | null;
    start: string;
    duration_s: number | null;
    distance_m: number | null;
    avg_hr: number | null;
    calories: number | null;
    coros_training_load: number | null;
  }[];
}

export interface HKSampleOut {
  type: string;
  uuid: string;
  start: string;
  end?: string;
  value: number;
  unit: string;
  source: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>("/health"),
  today: () => request<DayPayload>("/today"),
  days: (start: string, end: string) => request<DayPayload[]>(`/days?start=${start}&end=${end}`),
  activities: (limit = 50) => request<DayPayload["activities"]>(`/activities?limit=${limit}`),
  ingestAppleHealth: (samples: HKSampleOut[]) =>
    request<{ stored: number; skipped: number; unknown_type: number }>("/ingest/apple-health", {
      method: "POST",
      body: JSON.stringify({ samples }),
    }),
};

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
