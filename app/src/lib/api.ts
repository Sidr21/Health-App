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
    segments?: SleepSegmentOut[];
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

export type SleepStage = "awake" | "rem" | "light" | "deep" | "asleep";
export interface SleepSegmentOut {
  start: string;
  end: string;
  stage: SleepStage;
}

export interface HrMaxOut {
  value: number;
  method: string;
  candidates: Record<string, number>;
}

export interface ZoneOut {
  zone: number;
  name: string;
  lo_bpm: number | null;
  hi_bpm: number | null;
  seconds: number;
}

export interface WorkoutDetail {
  id: number;
  source: string;
  sport: string;
  sport_code: number | null;
  location: string | null;
  start: string;
  end: string | null;
  stats: {
    active_s: number | null;
    total_s: number | null;
    distance_m: number | null;
    avg_pace_s_per_km: number | null;
    best_km_s: number | null;
    avg_hr: number | null;
    max_hr: number | null;
    avg_power_w: number | null;
    avg_cadence: number | null;
    stride_m: number | null;
    elev_gain_m: number | null;
    elev_loss_m: number | null;
    calories: number | null;
  };
  coros: { training_load: number | null; aerobic_te: number | null; anaerobic_te: number | null; training_focus: string | null; performance: string | null };
  hr_max: HrMaxOut | null;
  zones: { method: "stream" | "laps"; zones: ZoneOut[]; focus: { low_aerobic: number; high_aerobic: number; anaerobic: number } | null } | null;
  hr_recovery: { drop_bpm: number; from_bpm: number; to_bpm: number; at_s: number; rating: string } | null;
  stream: { n: number; points: { t: number; hr: number | null; speed_mps: number | null; alt_m: number | null; power_w: number | null; cadence: number | null }[] };
  laps: { idx: number; duration_s: number | null; distance_m: number | null; avg_hr: number | null; max_hr: number | null; avg_pace_s_per_km: number | null; avg_power_w: number | null; avg_cadence: number | null }[];
  muscles: { id: MuscleId; name: string; share: number }[];
}

export interface JournalEntryOut {
  date: string;
  tag: string;
  value: number | null;
  note: string | null;
}

export interface InsightEffect {
  tag: string;
  metric: "recovery" | "sleep" | "hrv_ms" | "rhr";
  kind: "boolean" | "numeric";
  split: string;
  n_yes: number;
  n_no: number;
  mean_yes: number | null;
  mean_no: number | null;
  diff: number | null;
  z: number | null;
  strength: "clear" | "possible" | "none" | "need_more";
  good: boolean | null;
}

export interface InsightsOut {
  window: { start: string; end: string; days: number };
  logged_days: number;
  method: string;
  outcomes: Record<string, { label: string; unit: string; higher_is_better: boolean }>;
  effects: InsightEffect[];
}

export interface BodyMetricOut {
  label: string;
  unit: string;
  latest: { date: string; value: number; source: string } | null;
  change_30d?: number | null;
  method?: string | null;
  series: { date: string; value: number }[];
}

export interface BodySummary {
  height_cm: number | null;
  metrics: Record<"weight_kg" | "bmi" | "body_fat_pct" | "lean_mass_kg" | "waist_cm", BodyMetricOut>;
}

export interface SettingsOut {
  profile: { name: string | null; sex: string | null; dob: string | null; height_cm: number | null };
  hr_max: { set_value: number | null; set_source: string | null; effective: number | null; method: string | null; candidates: Record<string, number> };
  units: "imperial" | "metric";
  sleep_need_min: number;
  timezone: string;
  sources: { coros_last_sync: string | null; newest_activity: string | null; apple_last_sample: string | null };
}

export type SettingsIn = Partial<{
  sex: "male" | "female";
  dob: string;
  height_cm: number;
  hr_max: number;
  hr_max_source: "user" | "field_test";
  clear_hr_max: boolean;
  units: "imperial" | "metric";
  sleep_need_min: number;
}>;

export interface FitnessModels {
  hr_max: HrMaxOut | null;
  vo2max: { coros: { value: number; date: string } | null; ours: number | null; status: string };
  running_level: { value: number; date: string } | null;
  threshold: { coros_pace_s_per_km: { value: number; date: string } | null; ours_lthr: number | null; ours_pace_s_per_km: number | null; status: string };
  races: { key: string; label: string; distance_m: number; coros_s: { value: number; date: string } | null; ours_s: number | null }[];
  inputs: { runs: number; runs_with_streams: number };
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
  activity: (id: number | string) => request<WorkoutDetail>(`/activities/${id}`),
  journal: (start: string, end: string) => request<JournalEntryOut[]>(`/journal?start=${start}&end=${end}`),
  putJournal: (e: { date: string; tag: string; value: number | null; note?: string | null }) =>
    request<JournalEntryOut>("/journal", { method: "PUT", body: JSON.stringify(e) }),
  deleteJournal: (date: string, tag: string) => request<{ deleted: number }>(`/journal/${date}/${tag}`, { method: "DELETE" }),
  insights: (days = 90) => request<InsightsOut>(`/journal/insights?days=${days}`),
  bodySummary: (days = 365) => request<BodySummary>(`/body/summary?days=${days}`),
  settings: () => request<SettingsOut>("/settings"),
  putSettings: (body: SettingsIn) => request<SettingsOut>("/settings", { method: "PUT", body: JSON.stringify(body) }),
  fitnessModels: () => request<FitnessModels>("/fitness/models"),
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
