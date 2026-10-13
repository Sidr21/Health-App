import type { DayPayload } from "./api";

export interface Insight {
  title: string;
  body: string;
  tone: "good" | "neutral" | "bad";
}

interface RecoveryComps {
  band?: "green" | "amber" | "red";
  hrv_ms?: number;
  hrv_base_ms?: number;
  rhr?: number;
  rhr_base?: number;
  calibrating?: boolean;
  n_days?: number;
}

/** Rule-based insight text (DESIGN §7 "Insight" card). An LLM version comes in phase 6. */
export function insightFor(day: DayPayload | undefined): Insight | null {
  if (!day) return null;
  const rec = day.scores.recovery;
  if (!rec) return { title: "Calibrating", body: "Baselines need about two weeks of nights before recovery is scored.", tone: "neutral" };
  const c = (rec.components ?? {}) as RecoveryComps;
  const parts: string[] = [];
  if (c.hrv_ms != null && c.hrv_base_ms != null) {
    const rel = (c.hrv_ms - c.hrv_base_ms) / c.hrv_base_ms;
    if (rel > 0.08) parts.push(`Your resting HRV is ${c.hrv_ms.toFixed(0)} ms, above your usual ${c.hrv_base_ms.toFixed(0)} ms`);
    else if (rel < -0.08) parts.push(`Your resting HRV is ${c.hrv_ms.toFixed(0)} ms, below your usual ${c.hrv_base_ms.toFixed(0)} ms`);
    else parts.push(`Your resting HRV of ${c.hrv_ms.toFixed(0)} ms is right at your usual ${c.hrv_base_ms.toFixed(0)} ms`);
  }
  if (c.rhr != null && c.rhr_base != null) {
    const d = c.rhr - c.rhr_base;
    if (d <= -2) parts.push(`resting heart rate is ${Math.abs(d).toFixed(0)} bpm under your baseline`);
    else if (d >= 2) parts.push(`resting heart rate is ${d.toFixed(0)} bpm over your baseline`);
    else parts.push("resting heart rate is on baseline");
  }
  const sleep = day.scores.sleep;
  if (sleep && day.sleep?.asleep_s != null) {
    const h = day.sleep.asleep_s / 3600;
    if (sleep.value < 60) parts.push(`sleep was rough (${h.toFixed(1)} h, ${day.sleep.awake_count ?? 0} wake-ups)`);
    else if (sleep.value >= 85) parts.push(`sleep was solid at ${h.toFixed(1)} h`);
  }
  const body = parts.length ? parts.join(", ").replace(/^(.)/, (m) => m.toUpperCase()) + "." : "";
  if (c.band === "green") return { title: "You're well recovered", body: `${body} Today can carry a hard session.`.trim(), tone: "good" };
  if (c.band === "amber") return { title: "Partly recovered", body: `${body} Keep intensity moderate and see how tomorrow's night lands.`.trim(), tone: "neutral" };
  return { title: "Time to back off", body: `${body} An easy day or rest will pay back faster than pushing through.`.trim(), tone: "bad" };
}
