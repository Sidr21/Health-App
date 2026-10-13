import { useQuery } from "@tanstack/react-query";
import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card } from "@/components/Card";
import { MetricRow } from "@/components/MetricRow";
import { Ring } from "@/components/Ring";
import { api, isoDate, type DayPayload } from "@/lib/api";
import { dayLabel, hms, km, pct } from "@/lib/format";
import { bandColor, colors, font, spacing } from "@/theme/tokens";

function lastNDays(n: number): [string, string] {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (n - 1));
  return [isoDate(start), isoDate(end)];
}

function statusFor(value: number | null, base: number | null, lowerIsBetter: boolean) {
  if (value == null || base == null) return null;
  const rel = (value - base) / base;
  if (Math.abs(rel) < 0.05) return { label: "Normal", tone: "neutral" as const };
  const better = lowerIsBetter ? rel < 0 : rel > 0;
  return { label: better ? (lowerIsBetter ? "Below normal" : "Above normal") : lowerIsBetter ? "Above normal" : "Below normal", tone: better ? ("good" as const) : ("bad" as const) };
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [start, end] = lastNDays(14);
  const q = useQuery({ queryKey: ["days", start, end], queryFn: () => api.days(start, end) });
  const days: DayPayload[] = q.data ?? [];
  const today = days[days.length - 1];
  const rec = today?.scores.recovery;
  const sleep = today?.scores.sleep;
  const comps = (rec?.components ?? {}) as { band?: "green" | "amber" | "red"; hrv_ms?: number; hrv_base_ms?: number; rhr?: number; rhr_base?: number; calibrating?: boolean };
  const hrvSeries = days.map((d) => ((d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null));
  const rhrSeries = days.map((d) => d.daily.rhr);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing.xxl }}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} tintColor={colors.textMuted} />}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{today ? dayLabel(today.date) : "Today"}</Text>
        {comps.calibrating ? <Text style={styles.calib}>calibrating</Text> : null}
      </View>

      <Card>
        <View style={styles.rings}>
          <Ring label="Strain" progress={null} value="–" color={colors.strain} />
          <Ring label="Recovery" progress={rec ? rec.value / 100 : null} value={rec ? pct(rec.value) : "–"} color={bandColor(comps.band)} />
          <Ring label="Sleep" progress={sleep ? sleep.value / 100 : null} value={sleep ? pct(sleep.value) : "–"} color={colors.sleep} />
        </View>
        {!today && !q.isLoading ? (
          <Text style={styles.empty}>{q.isError ? `Cannot reach the backend (${String(q.error)})` : "Nothing to see yet. Run `health coros sync` on the backend."}</Text>
        ) : null}
      </Card>

      <MetricRow
        title="Resting HRV"
        value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"}
        unit="ms"
        status={statusFor(comps.hrv_ms ?? null, comps.hrv_base_ms ?? null, false)}
        series={hrvSeries}
        band={comps.hrv_base_ms ? { low: comps.hrv_base_ms * 0.85, high: comps.hrv_base_ms * 1.15 } : null}
        color={colors.recovery}
      />
      <MetricRow
        title="Resting HR"
        value={today?.daily.rhr != null ? String(today.daily.rhr) : "–"}
        unit="bpm"
        status={statusFor(today?.daily.rhr ?? null, comps.rhr_base ?? null, true)}
        series={rhrSeries}
        band={comps.rhr_base ? { low: comps.rhr_base - 3, high: comps.rhr_base + 3 } : null}
        color={colors.cardio}
      />
      <MetricRow
        title="Sleep"
        value={hms(today?.sleep?.asleep_s)}
        status={today?.sleep?.coros_score != null ? { label: `COROS score ${today.sleep.coros_score}`, tone: "neutral" } : null}
        series={days.map((d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null))}
        color={colors.sleep}
      />

      <Card title="Today's workouts">
        {today?.activities.length ? (
          today.activities.map((a) => (
            <View key={a.id} style={styles.activity}>
              <Text style={styles.activityName}>{a.sport}</Text>
              <Text style={styles.activityMeta}>
                {hms(a.duration_s)} · {km(a.distance_m)} · {a.avg_hr ?? "–"} bpm · {a.calories ?? "–"} kcal
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No workouts today</Text>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.lg },
  title: { ...font.title, color: colors.text },
  calib: { ...font.label, color: colors.recoveryAmber },
  rings: { flexDirection: "row", justifyContent: "space-around" },
  empty: { ...font.body, color: colors.textMuted, marginTop: spacing.md, textAlign: "center" },
  activity: { paddingVertical: spacing.sm },
  activityName: { ...font.heading, color: colors.text },
  activityMeta: { ...font.label, color: colors.textMuted, marginTop: 2 },
});
