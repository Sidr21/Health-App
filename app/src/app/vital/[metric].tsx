import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import type { DayPayload } from "@/lib/api";
import { hms } from "@/lib/format";
import { shortDate } from "@/lib/scores";
import { useDays } from "@/lib/useDays";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

import type { VitalKey } from "@/lib/vitals";

interface Vital {
  title: string;
  unit?: string;
  color: string;
  better: "up" | "down" | null;
  get: (d: DayPayload) => number | null;
  fmt: (v: number) => string;
  about: string;
}

const VITALS: Record<VitalKey, Vital> = {
  hrv: {
    title: "Resting HRV",
    unit: "ms",
    color: colors.recovery,
    better: "up",
    get: (d) => (d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null,
    fmt: (v) => v.toFixed(0),
    about: "Nightly RMSSD from your watch's sleep HRV readings. Above your normal range usually means you have absorbed recent training; a run of low nights often comes before illness or after hard blocks, alcohol or short sleep.",
  },
  rhr: {
    title: "Resting HR",
    unit: "bpm",
    color: colors.cardio,
    better: "down",
    get: (d) => d.daily.rhr,
    fmt: (v) => v.toFixed(0),
    about: "COROS's resting heart rate for the day. It drifts down as aerobic fitness builds; a few beats above your normal points to fatigue, heat, illness or a late meal or drink.",
  },
  sleep_hr: {
    title: "Sleep HR",
    unit: "bpm",
    color: colors.sleep,
    better: "down",
    get: (d) => d.sleep?.hr_avg ?? null,
    fmt: (v) => v.toFixed(0),
    about: "Average heart rate across the night. It rises after hard evening sessions, late meals and alcohol, so it reacts to the day before more than resting HR does.",
  },
  stress: {
    title: "Stress",
    color: colors.stress,
    better: "down",
    get: (d) => d.scores.stress?.value ?? d.daily.stress_avg,
    fmt: (v) => v.toFixed(0),
    about: "Awake average of COROS's HRV-based stress (0–100), or COROS's daily average on days before our engine had samples.",
  },
  asleep: {
    title: "Time asleep",
    color: colors.sleepDeep,
    better: "up",
    get: (d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null),
    fmt: (v) => hms(v * 3600),
    about: "Total sleep, not time in bed. Most adults need 7–9 hours; consistency matters as much as the total.",
  },
  steps: {
    title: "Steps",
    color: colors.energy,
    better: "up",
    get: (d) => d.daily.steps,
    fmt: (v) => Math.round(v).toLocaleString(),
    about: "Daily steps from COROS, including those in workouts. Steps outside workouts add to your daily strain.",
  },
};

const RANGES = [
  { k: "30D", days: 30 },
  { k: "90D", days: 90 },
  { k: "1Y", days: 365 },
] as const;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export default function VitalScreen() {
  const { metric } = useLocalSearchParams<{ metric: VitalKey }>();
  const v = VITALS[metric] ?? VITALS.hrv;
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[0]);
  const q = useDays(range.days);
  const series = q.days.map((d, i) => ({ x: i, y: v.get(d) }));
  const vals = series.map((p) => p.y).filter((x): x is number => x != null);
  const latestIdx = [...series].reverse().find((p) => p.y != null);
  const latest = latestIdx?.y ?? null;
  const avg = vals.length ? mean(vals) : null;
  const sd = vals.length > 2 && avg != null ? Math.sqrt(mean(vals.map((x) => (x - avg) ** 2))) : null;
  const band = avg != null && sd != null ? { lo: avg - sd, hi: avg + sd } : null;
  const week = series.slice(-7).map((p) => p.y).filter((x): x is number => x != null);
  const weekAvg = week.length ? mean(week) : null;
  const diff = weekAvg != null && avg != null ? weekAvg - avg : null;
  const good = diff == null || v.better == null || Math.abs(diff) < (sd ?? 0) * 0.25 ? null : (diff > 0) === (v.better === "up");
  const latestDate = latestIdx ? q.days[latestIdx.x]?.date : null;
  const status =
    latest == null || band == null ? null : latest > band.hi ? "Above your normal" : latest < band.lo ? "Below your normal" : "Within your normal";

  const stat = (label: string, x: number | null) => (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{x == null ? "–" : v.fmt(x)}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Backdrop glow="home" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title={v.title} subtitle={latestDate ? `Latest ${shortDate(latestDate)}` : undefined} />
        <View style={styles.body}>
          <Surface style={styles.hero} radiusSize={radius.lg}>
            <Text style={styles.big}>{latest != null ? v.fmt(latest) : "–"}{v.unit ? <Text style={styles.unit}> {v.unit}</Text> : null}</Text>
            {status ? <Text style={[styles.sub, { color: status.startsWith("Within") ? colors.textMuted : colors.text }]}>{status}{band ? ` (${v.fmt(band.lo)}–${v.fmt(band.hi)})` : ""}</Text> : null}
          </Surface>

          <View style={styles.ranges}>
            {RANGES.map((r) => (
              <Pressable key={r.k} onPress={() => setRange(r)} style={[styles.range, range.k === r.k && styles.rangeOn]}>
                <Text style={[styles.rangeText, range.k === r.k && { color: colors.text }]}>{r.k}</Text>
              </Pressable>
            ))}
          </View>

          <Surface style={styles.card}>
            {vals.length ? (
              <LineChart
                id={`vital-${metric}`}
                points={series}
                color={v.color}
                dots={range.days <= 30}
                height={190}
                bands={band ? [{ ...band, color: v.color }] : undefined}
                yFormat={(x) => (metric === "asleep" ? `${x.toFixed(0)}h` : metric === "steps" ? `${Math.round(x / 1000)}k` : x.toFixed(0))}
                xLabels={q.days.length ? [shortDate(q.days[0].date), "Today"] : undefined}
              />
            ) : (
              <Text style={styles.note}>{q.isLoading ? "Loading…" : "No readings in this range yet."}</Text>
            )}
            <Text style={styles.note}>Shaded: your normal range, the average ± one standard deviation over this period.</Text>
            <View style={styles.stats}>
              {stat("Average", avg)}
              {stat("Lowest", vals.length ? Math.min(...vals) : null)}
              {stat("Highest", vals.length ? Math.max(...vals) : null)}
            </View>
          </Surface>

          {diff != null && range.days > 7 ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>Last 7 days</Text>
              <Text style={[styles.trend, good == null ? null : { color: good ? colors.recovery : colors.recoveryAmber }]}>
                {weekAvg != null ? v.fmt(weekAvg) : "–"}{v.unit ? ` ${v.unit}` : ""} · {diff >= 0 ? "+" : "−"}{v.fmt(Math.abs(diff))} vs {range.k} average
              </Text>
            </Surface>
          ) : null}

          <SectionLabel title="About" />
          <Surface style={styles.card}>
            <Text style={styles.note}>{v.about}</Text>
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { marginBottom: spacing.md, gap: 4 },
  big: { fontFamily: fonts.numeral, fontSize: 48, color: colors.text },
  unit: { fontSize: 16, fontFamily: fonts.label, color: colors.textMuted },
  sub: { ...font.label },
  ranges: { flexDirection: "row", gap: 6, marginBottom: spacing.md },
  range: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center" },
  rangeOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  rangeText: { ...font.overline, fontSize: 11, color: colors.textMuted },
  card: { marginBottom: spacing.md, gap: 10 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  note: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  stats: { flexDirection: "row" },
  stat: { flex: 1 },
  statLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  statValue: { fontFamily: fonts.numeral, fontSize: 20, color: colors.text, marginTop: 2 },
  trend: { fontFamily: fonts.numeral, fontSize: 18, color: colors.text },
});
