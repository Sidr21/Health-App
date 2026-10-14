import type { LthrSource, ZoneBasis } from "@/lib/api";

export const LTHR_SOURCE: Record<LthrSource, string> = {
  user: "set by you",
  ours: "measured from your runs",
  effort_floor: "from your hardest 10 minutes",
  prior: "89% of max HR (no hard runs yet)",
};

/** One line saying what a set of zones is anchored to. */
export function zoneBasisLabel(z: ZoneBasis): string {
  if (z.basis === "lthr" && z.lthr) return `threshold HR ${Math.round(z.lthr)} · ${LTHR_SOURCE[z.lthr_source ?? "prior"]}`;
  return `% of max HR ${z.hr_max}`;
}
