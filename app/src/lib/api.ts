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

export type DayStatus = "active" | "rest_day" | "sick" | "travel";

export interface DayPayload {
  date: string;
  status?: DayStatus;
  vitals?: { resp_rate?: number; spo2_pct?: number };
  scores: Partial<Record<"recovery" | "sleep" | "strain" | "stress" | "energy" | "cardio_load" | "muscular", ScoreEntry>>;
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

export type LthrSource = "user" | "ours" | "effort_floor" | "prior";

export interface ZoneBasis {
  basis: "lthr" | "hr_max";
  hr_max: number;
  lthr: number | null;
  lthr_source: LthrSource | null;
}

export interface ZonesOut extends ZoneBasis {
  hr_max_method: string | null;
  hr: { zone: number; name: string; lo_bpm: number | null; hi_bpm: number | null }[];
  threshold_pace_s_per_km: number | null;
  threshold_pace_source: "ours" | "coros" | null;
  pace: { zone: number; name: string; slow_s: number | null; fast_s: number | null }[] | null;
}

export interface WorkoutDetail {
  id: number;
  load: { trimp: number; method: "stream" | "avg_hr" | "coros_load" | "none"; strain: number };
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
  zones: (ZoneBasis & { method: "stream" | "laps"; zones: ZoneOut[]; focus: { low_aerobic: number; high_aerobic: number; anaerobic: number } | null }) | null;
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
  lthr: { set_value: number | null };
  zones: ZonesOut | null;
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
  lthr: number;
  clear_lthr: boolean;
  zone_basis: "lthr" | "hr_max";
  units: "imperial" | "metric";
  sleep_need_min: number;
}>;

export interface StressDayOut {
  date: string;
  samples: { t: string; v: number }[];
  asleep: { start: string; end: string }[];
  levels: { name: "Rest" | "Low" | "Medium" | "High"; from: number; minutes: number }[];
  awake_mean: number | null;
  high_minutes: number | null;
}

export interface RaceOut {
  id: number;
  date: string;
  name: string | null;
  distance_m: number;
  time_s: number;
  vdot: number;
  predicted_s: number | null;
}

export interface SyncStateOut {
  enabled: boolean;
  interval_min: number;
  running: boolean;
  last_started: string | null;
  last_finished: string | null;
  last_ok: boolean | null;
  last_error: string | null;
  last_days: number | null;
  next_run: string | null;
  coros_auth: boolean;
}

export interface ConnectionsOut {
  coros: { connected: boolean; last_sync: string | null; newest_activity: string | null; sync: SyncStateOut };
  apple_health: { last_sample: string | null; metrics: { metric: string; samples: number; latest: string | null }[]; sleep_nights: number };
  strength: { source: string; sets: number; latest: string | null }[];
  server: { version: string; public: boolean; tz: string };
}

export interface HrRecoveryOut {
  drop_bpm: number;
  from_bpm: number;
  to_bpm: number;
  rating: string;
  activity_id: number;
  date: string;
}

export interface ValueAt {
  value: number;
  date: string;
  ci?: [number, number];
}

export interface FitnessModels {
  hr_max: HrMaxOut | null;
  vo2max: { coros: ValueAt | null; ours: ValueAt | null; parts: Record<string, number>; lower_bound: ValueAt | null; status: string | null };
  running_level: ValueAt | null;
  lthr: { value: number; ci: [number, number] | null; parts: Record<string, number>; source: LthrSource; prior_only: boolean } | null;
  threshold: { coros_pace_s_per_km: ValueAt | null; ours_lthr: number | null; ours_pace_s_per_km: number | null; pace_method: string | null; status: string | null };
  critical_speed: { m_per_s: number; d_prime_m: number | null } | null;
  races: { key: string; label: string; distance_m: number; coros_s: ValueAt | null; ours_s: number | null }[];
  prediction: { vdot: number; method: string; economy: number | null } | null;
  inputs: { runs: number; runs_with_streams: number };
  hr_recovery: {
    latest: HrRecoveryOut | null;
    best: HrRecoveryOut | null;
    checked: number;
  } | null;
}

export interface BioAgeOut {
  value: number | null;
  date?: string;
  age?: number;
  delta?: number;
  fitness_age?: number | null;
  contributions?: Record<string, number>;
  adjustments?: Record<string, number>;
  inputs?: Record<string, number | string | null>;
  vo2max_source?: string | null;
  norms?: Partial<Record<"vo2max" | "rhr" | "hrv_ms" | "sleep_score", number>> &
    Partial<Record<"bmi" | "body_fat_pct" | "sleep_h" | "met_min_week", [number | null, number | null]>>;
  previous?: { date: string; value: number; contributions: Record<string, number>; inputs: Record<string, number | string | null> } | null;
  history: { date: string; value: number }[];
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

export type LabFlag = "low" | "high" | "normal" | "abnormal" | "critical_low" | "critical_high";
export type DocStatus = "processing" | "review" | "confirmed" | "failed";

export interface LabResultOut {
  id: number;
  analyte: string;
  known: boolean;
  label: string;
  category: string;
  name: string;
  panel: string | null;
  date: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  ref_low: number | null;
  ref_high: number | null;
  ref_text: string | null;
  value_std: number | null;
  unit_std: string | null;
  ref_low_std: number | null;
  ref_high_std: number | null;
  flag: LabFlag | null;
  flag_source: "printed" | "range" | "none" | null;
  method: string | null;
  issue: string | null;
  page: number | null;
  included: boolean;
}

export interface DocumentOut {
  id: number;
  uploaded_at: string;
  status: DocStatus;
  error: string | null;
  kind: string | null;
  title: string | null;
  provider: string | null;
  collected_on: string | null;
  summary: string | null;
  files: { name: string; mime: string; size: number }[];
  model: string | null;
  usage: { input_tokens: number; output_tokens: number } | null;
  duplicate?: boolean;
  result_count?: number;
  flagged_count?: number;
  results?: LabResultOut[];
  notes?: { title: string; text: string }[];
}

export interface LabMarker extends LabResultOut {
  count: number;
  previous: { date: string | null; value_std: number | null; value: number | null } | null;
}

export interface LabHistory {
  analyte: string;
  label: string;
  category: string;
  unit: string | null;
  results: (LabResultOut & { document_id: number })[];
}

/** A file for multipart upload: a native file URI, or a browser File on web. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
  file?: Blob;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** The `detail` of a FastAPI error body, else the raw text. */
export function errorText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  try {
    const detail = (JSON.parse(e.message) as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  } catch {
    // not JSON
  }
  return e.message;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // multipart bodies need fetch to set the Content-Type itself (it adds the boundary)
  const json = !(typeof FormData !== "undefined" && init?.body instanceof FormData);
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      ...(json ? { "Content-Type": "application/json" } : {}),
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
  bioage: () => request<BioAgeOut>("/bioage"),
  stressDay: (date: string) => request<StressDayOut>(`/stress/${date}`),
  zones: () => request<ZonesOut>("/zones"),
  syncState: () => request<SyncStateOut>("/sync/state"),
  syncNow: () => request<SyncStateOut>("/sync", { method: "POST" }),
  connections: () => request<ConnectionsOut>("/connections"),
  status: () => request<{ status: DayStatus; since: string | null }>("/status"),
  putStatus: (status: DayStatus) =>
    request<{ status: DayStatus; since: string | null }>("/status", { method: "PUT", body: JSON.stringify({ status }) }),
  corosLoginStart: (returnTo?: string) =>
    request<{ auth_url: string; callback_url: string }>("/connect/coros/start", { method: "POST", body: JSON.stringify({ return_to: returnTo }) }),
  corosDisconnect: () => request<{ removed: boolean; connected: boolean }>("/connect/coros", { method: "DELETE" }),
  importStrengthCsv: (csv: string, unit: "lb" | "kg") =>
    request<{ source: string; sets: number; sessions: number }>(`/import/strength-csv?unit=${unit}`, {
      method: "POST",
      body: csv,
      headers: { "Content-Type": "text/csv" },
    }),
  races: () => request<RaceOut[]>("/races"),
  addRace: (body: { date: string; distance_m: number; time_s: number; name?: string }) =>
    request<RaceOut>("/races", { method: "POST", body: JSON.stringify(body) }),
  deleteRace: (id: number) => request<{ deleted: number }>(`/races/${id}`, { method: "DELETE" }),
  strengthExercises: () =>
    request<{ common: CommonExercise[]; muscles: { id: MuscleId; name: string; views: string[] }[] }>("/strength/exercises"),
  logStrength: (body: LogSessionIn) =>
    request<{ session_key: string; sets: number }>("/strength/sessions", { method: "POST", body: JSON.stringify(body) }),
  deleteStrength: (key: string, source = "manual") =>
    request<{ deleted: number }>(`/strength/sessions/${encodeURIComponent(key)}?source=${source}`, { method: "DELETE" }),
  documents: () => request<DocumentOut[]>("/documents"),
  document: (id: number | string) => request<DocumentOut>(`/documents/${id}`),
  uploadDocument: (files: UploadFile[]) => {
    const form = new FormData();
    for (const f of files) {
      // React Native's FormData takes {uri, name, type}; the browser takes a Blob
      form.append("files", f.file ?? ({ uri: f.uri, name: f.name, type: f.type } as unknown as Blob), f.name);
    }
    return request<DocumentOut>("/documents", { method: "POST", body: form });
  },
  patchLabResult: (docId: number, resultId: number, body: Partial<{ included: boolean; value: number; unit: string; ref_low: number | null; ref_high: number | null; analyte: string }>) =>
    request<LabResultOut>(`/documents/${docId}/results/${resultId}`, { method: "PATCH", body: JSON.stringify(body) }),
  confirmDocument: (id: number) => request<DocumentOut>(`/documents/${id}/confirm`, { method: "POST" }),
  retryDocument: (id: number) => request<DocumentOut>(`/documents/${id}/retry`, { method: "POST" }),
  deleteDocument: (id: number) => request<{ deleted: number }>(`/documents/${id}`, { method: "DELETE" }),
  labs: () => request<{ markers: LabMarker[]; categories: string[]; flagged: number }>("/labs"),
  labHistory: (analyte: string) => request<LabHistory>(`/labs/${encodeURIComponent(analyte)}`),
  ingestAppleHealth: (samples: HKSampleOut[]) =>
    request<{ stored: number; skipped: number; unknown_type: number }>("/ingest/apple-health", {
      method: "POST",
      body: JSON.stringify({ samples }),
    }),
};

/** YYYY-MM-DD of `d` in the device's time zone (toISOString would give the UTC date, which is
 * already tomorrow on a US evening). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
