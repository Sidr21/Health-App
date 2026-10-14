/**
 * Display units, from the backend Settings (stored values are always metric).
 * Set once the settings load; screens re-render because the settings query invalidates them.
 */
export type Units = "imperial" | "metric";

let current: Units = "imperial";

export function setUnits(u: Units): void {
  current = u;
}
export function getUnits(): Units {
  return current;
}
export const weightUnit = (): "lb" | "kg" => (current === "imperial" ? "lb" : "kg");

const KM_PER_MI = 1.609344;

/** "6:10 /km" or "9:55 /mi" from seconds per km. */
export function pace(sPerKm: number | null | undefined, units: Units = current): string {
  if (sPerKm == null || !isFinite(sPerKm) || sPerKm <= 0) return "–";
  const s = units === "imperial" ? sPerKm * KM_PER_MI : sPerKm;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec === 60 ? 59 : sec).padStart(2, "0")} /${units === "imperial" ? "mi" : "km"}`;
}

export function distance(m: number | null | undefined, units: Units = current): string {
  if (m == null) return "–";
  return units === "imperial" ? `${(m / 1609.344).toFixed(2)} mi` : `${(m / 1000).toFixed(2)} km`;
}

export function elevation(m: number | null | undefined, units: Units = current): string {
  if (m == null) return "–";
  return units === "imperial" ? `${Math.round(m * 3.28084)} ft` : `${Math.round(m)} m`;
}

export function height(cm: number | null | undefined, units: Units = current): string {
  if (cm == null) return "–";
  if (units === "metric") return `${Math.round(cm)} cm`;
  const inches = cm / 2.54;
  return `${Math.floor(inches / 12)}′${Math.round(inches % 12)}″`;
}

export function clockDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

/** "mm:ss" or "h:mm:ss" → seconds; null when malformed. */
export function parseClock(t: string): number | null {
  const parts = t.trim().split(":").map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => Number.isNaN(p))) return null;
  const [h, m, s] = parts.length === 3 ? parts : [0, ...parts];
  if (m >= 60 || s >= 60) return null;
  return h * 3600 + m * 60 + s;
}
