import { isoDate } from "./api";

export const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekdayIndex(iso: string): number {
  return new Date(`${iso}T00:00:00`).getDay();
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function monthLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

export function longDayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" });
}

/** Sunday-to-Saturday week containing `iso`. */
export function weekOf(iso: string): string[] {
  const start = addDays(iso, -weekdayIndex(iso));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
