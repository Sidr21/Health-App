/** Lab results: display helpers for the documents and labs screens (values are standardized on
 * the server, backend/health/engine/labs.py). */
import type { LabFlag, LabResultOut } from "@/lib/api";
import { colors } from "@/theme/tokens";

export const KIND_LABEL: Record<string, string> = {
  lab_report: "Lab report",
  doctor_note: "Doctor's note",
  imaging_report: "Imaging report",
  discharge_summary: "Discharge summary",
  prescription: "Prescription",
  other: "Document",
};

export function isOut(flag: LabFlag | null | undefined): boolean {
  return flag != null && flag !== "normal";
}

export function flagLabel(flag: LabFlag | null | undefined): string | null {
  switch (flag) {
    case "high":
      return "High";
    case "low":
      return "Low";
    case "critical_high":
      return "Critical high";
    case "critical_low":
      return "Critical low";
    case "abnormal":
      return "Abnormal";
    default:
      return null;
  }
}

export function flagColor(flag: LabFlag | null | undefined): string {
  if (flag === "critical_high" || flag === "critical_low") return colors.recoveryRed;
  if (isOut(flag)) return colors.recoveryAmber;
  if (flag === "normal") return colors.recovery;
  return colors.textMuted;
}

/** Three significant figures without trailing zeros: 131.5 -> "132", 5.43 -> "5.43", 0.012 -> "0.012". */
export function fmtNum(v: number): string {
  const a = Math.abs(v);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  return String(Number(v.toFixed(digits)));
}

/** The value to show: standardized when we could convert it, else as printed. */
export function shown(r: Pick<LabResultOut, "value" | "value_text" | "unit" | "value_std" | "unit_std" | "ref_low" | "ref_high" | "ref_low_std" | "ref_high_std">): {
  value: string;
  unit: string;
  lo: number | null;
  hi: number | null;
  num: number | null;
} {
  if (r.value_std != null) return { value: fmtNum(r.value_std), unit: r.unit_std ?? "", lo: r.ref_low_std, hi: r.ref_high_std, num: r.value_std };
  if (r.value != null) return { value: fmtNum(r.value), unit: r.unit ?? "", lo: r.ref_low, hi: r.ref_high, num: r.value };
  return { value: r.value_text ?? "–", unit: r.value_text ? "" : (r.unit ?? ""), lo: null, hi: null, num: null };
}

export function rangeText(lo: number | null, hi: number | null): string | null {
  if (lo != null && hi != null) return `${fmtNum(lo)}–${fmtNum(hi)}`;
  if (hi != null) return `< ${fmtNum(hi)}`;
  if (lo != null) return `> ${fmtNum(lo)}`;
  return null;
}

/** Layout of a range bar: where the normal band sits and where the value falls, both 0–1. */
export function rangeLayout(v: number | null, lo: number | null, hi: number | null): { band: [number, number]; dot: number | null } | null {
  if (lo == null && hi == null) return null;
  let min: number;
  let max: number;
  if (lo != null && hi != null) {
    const span = Math.max(hi - lo, Math.abs(hi) * 0.05, 1e-6);
    min = lo - span * 0.6;
    max = hi + span * 0.6;
  } else if (hi != null) {
    min = 0;
    max = hi * 1.5;
  } else {
    min = 0;
    max = (lo as number) * 2;
  }
  if (max <= min) return null;
  const pos = (x: number) => Math.min(0.98, Math.max(0.02, (x - min) / (max - min)));
  return {
    band: [lo != null ? pos(lo) : 0, hi != null ? pos(hi) : 1],
    dot: v == null ? null : pos(v),
  };
}

export function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    out.set(k, [...(out.get(k) ?? []), it]);
  }
  return [...out.entries()];
}

/** Change since the previous result, at the precision the value itself is shown with. */
export function delta(now: number | null, before: number | null | undefined): string | null {
  if (now == null || before == null) return null;
  const a = Math.abs(now);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
  const d = Number((now - before).toFixed(digits));
  if (d === 0) return "no change";
  return `${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

/** A y range that holds both the values and the normal band, so the band is always on screen. */
export function chartDomain(values: number[], lo: number | null, hi: number | null): [number, number] | undefined {
  if (!values.length) return undefined;
  const all = [...values, ...(lo != null ? [lo] : []), ...(hi != null ? [hi] : [])];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min || Math.abs(max) || 1) * 0.12;
  return [Math.max(0, min - pad), max + pad];
}

/** "Mar 2" this year, "Sep 10, 2025" before it. */
export function labDate(iso: string | null, now = new Date()): string {
  if (!iso) return "undated";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
