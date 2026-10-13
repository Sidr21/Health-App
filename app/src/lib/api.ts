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

export type MuscleId =
  | "chest" | "shoulders" | "biceps" | "triceps" | "forearms" | "abs" | "obliques" | "traps"
  | "lats" | "lower_back" | "glutes" | "quads" | "hamstrings" | "adductors" | "calves";

export type MuscleStatus = "recovered" | "fatigued" | "depleted";

export interface MuscleStateOut {
  id: MuscleId;
  name: string;
  views: ("front" | "back")[];
  freshness: number;
  status: MuscleStatus;
  fatigue: number;
  load_7d: number;
  sets_7d: number;
  volume_7d_kg: number;
  last_trained: string | null;
  sources: Partial<Record<"strength" | "cardio", number>>;
}

export interface StrengthSession {
  key: string;
  source: "coros" | "strong" | "hevy" | "manual";
  name: string | null;
  start: string;
  date: string;
  sets: number;
  volume_kg: number;
  exercises: { name: string; sets: number; reps: number; best_weight_kg: number | null; best_reps: number | null }[];
}

export interface StrengthSummary {
  date: string;
  at: string;
  method: { name: string; freshness_k: number; inputs: { sets: number; activities: number; duplicates_dropped: number } };
  muscles: MuscleStateOut[];
  totals: { sets_7d: number; volume_7d_kg: number; sessions_7d: number; sets_prev_7d: number; volume_prev_7d_kg: number };
  load: { acute: number; chronic: number | null; ratio: number | null; optimal: [number, number] | null; status: string };
  daily: { date: string; sets: number; volume_kg: number; load: number }[];
  sessions: StrengthSession[];
}

export interface CommonExercise {
  name: string;
  family: string;
  primary: MuscleId;
  muscles: Partial<Record<MuscleId, number>>;
}

export interface LogSetIn {
  exercise: string;
  reps: number | null;
  weight: number | null;
  set_type?: "normal" | "warmup" | "dropset" | "failure";
}

export interface LogSessionIn {
  started_at?: string;
  name?: string | null;
  unit: "lb" | "kg";
  session_key?: string;
  sets: LogSetIn[];
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
  strength: (date: string) => request<StrengthSummary>(`/strength?date=${date}`),
  strengthExercises: () =>
    request<{ common: CommonExercise[]; muscles: { id: MuscleId; name: string; views: string[] }[] }>("/strength/exercises"),
  logStrength: (body: LogSessionIn) =>
    request<{ session_key: string; sets: number }>("/strength/sessions", { method: "POST", body: JSON.stringify(body) }),
  deleteStrength: (key: string, source = "manual") =>
    request<{ deleted: number }>(`/strength/sessions/${encodeURIComponent(key)}?source=${source}`, { method: "DELETE" }),
  ingestAppleHealth: (samples: HKSampleOut[]) =>
    request<{ stored: number; skipped: number; unknown_type: number }>("/ingest/apple-health", {
      method: "POST",
      body: JSON.stringify({ samples }),
    }),
};

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
