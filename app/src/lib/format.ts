export function hms(seconds: number | null | undefined): string {
  if (seconds == null) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m.toString().padStart(2, "0")}m` : `${m}m`;
}

export function km(meters: number | null | undefined, units: "metric" | "imperial" = "imperial"): string {
  if (meters == null) return "–";
  return units === "imperial" ? `${(meters / 1609.344).toFixed(2)} mi` : `${(meters / 1000).toFixed(2)} km`;
}

export function pct(v: number | null | undefined): string {
  return v == null ? "–" : `${Math.round(v)}%`;
}

export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** "12 min ago", "3 h ago", else a short date; "never" for null. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "never";
  const mins = Math.round((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
