import { useQuery } from "@tanstack/react-query";

import { api, isoDate, type DayPayload } from "./api";
import { addDays } from "./dates";

export function todayIso(): string {
  return isoDate(new Date());
}

/** Last N days up to `endDate` (today by default), oldest first. Shared by every tab. */
export function useDays(n = 28, endDate?: string) {
  const end = endDate ?? todayIso();
  const start = addDays(end, -(n - 1));
  const q = useQuery({ queryKey: ["days", start, end], queryFn: () => api.days(start, end) });
  const days: DayPayload[] = q.data ?? [];
  const byDate = new Map(days.map((d) => [d.date, d]));
  return { ...q, days, byDate, start, end };
}
