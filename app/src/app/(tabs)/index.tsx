import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { Avatar, Header } from "@/components/Header";
import { CloudIcon, MoonIcon, PulseIcon, HeartIcon, RunnerIcon, SunIcon } from "@/components/icons";
import { InsightCard } from "@/components/InsightCard";
import { MetricCard, type Tone } from "@/components/MetricCard";
import { Ring } from "@/components/Ring";
import { Screen } from "@/components/Screen";
import { WorkoutCard } from "@/components/WorkoutCard";
import { hms, pct } from "@/lib/format";
import { insightFor } from "@/lib/insight";
import { useDays } from "@/lib/useDays";
import { DEFAULT_LOCATION, fetchWeather } from "@/lib/weather";
import { bandColor, colors, font, spacing } from "@/theme/tokens";

interface RecoveryComps {
  band?: "green" | "amber" | "red";
  hrv_ms?: number;
  hrv_base_ms?: number;
  rhr?: number;
  rhr_base?: number;
  calibrating?: boolean;
}

function statusFor(value: number | null, base: number | null, lowerIsBetter: boolean) {
  if (value == null || base == null) return null;
  const rel = (value - base) / base;
  if (Math.abs(rel) < 0.08) return { label: "Normal", tone: "neutral" as Tone };
  const up = rel > 0;
  const better = lowerIsBetter ? !up : up;
  return { label: up ? "Above normal" : "Below normal", tone: (better ? "good" : "bad") as Tone, direction: up ? ("up" as const) : ("down" as const) };
}

function headerDate(iso: string | undefined): string {
  if (!iso) return "Today";
  const d = new Date(`${iso}T00:00:00`);
  return `Today, ${d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}

export default function HomeScreen() {
  const q = useDays(14);
  const today = q.days[q.days.length - 1];
  const weather = useQuery({ queryKey: ["weather"], queryFn: () => fetchWeather(), staleTime: 30 * 60_000 });
  const rec = today?.scores.recovery;
  const sleep = today?.scores.sleep;
  const comps = (rec?.components ?? {}) as RecoveryComps;
  const hrvSeries = q.days.map((d) => ((d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null));
  const rhrSeries = q.days.map((d) => d.daily.rhr);
  const sleepSeries = q.days.map((d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null));
  const insight = insightFor(today);
  const WeatherIcon = weather.data && weather.data.code >= 3 ? CloudIcon : SunIcon;

  return (
    <Screen refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <Header
        title={headerDate(today?.date)}
        dropdown
        right={
          <Pressable onPress={() => router.push("/settings")}>
            <Avatar initials="SR" />
          </Pressable>
        }
      />
      <View style={styles.chips}>
        <Chip icon={<RunnerIcon size={16} color={colors.text} />} title="Active" subtitle="Until changed" dropdown />
        <Chip
          icon={<WeatherIcon size={16} color={colors.text} />}
          title={weather.data ? `${Math.round(weather.data.tempF)}°F` : "–°"}
          subtitle={DEFAULT_LOCATION.name}
        />
      </View>

      <Card style={styles.ringCard}>
        <View style={styles.rings}>
          <Ring label="Strain" progress={null} value="–%" color={colors.strain} />
          <View style={styles.divider} />
          <Ring label="Recovery" progress={rec ? rec.value / 100 : null} value={rec ? pct(rec.value) : "–%"} color={bandColor(comps.band)} />
          <View style={styles.divider} />
          <Ring label="Sleep" progress={sleep ? sleep.value / 100 : null} value={sleep ? pct(sleep.value) : "–%"} color={colors.sleep} />
        </View>
        {comps.calibrating ? <Text style={styles.calib}>Calibrating · baselines need 14 nights</Text> : null}
        {!today && !q.isLoading ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>Nothing to see yet!</Text>
            <Text style={styles.empty}>{q.isError ? `Cannot reach the backend (${String(q.error)})` : "Sync your COROS data to get insights about your Recovery state."}</Text>
          </View>
        ) : null}
      </Card>

      {insight ? <InsightCard insight={insight} /> : null}

      <MetricCard
        icon={PulseIcon}
        title="Resting HRV"
        value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"}
        unit="ms"
        status={statusFor(comps.hrv_ms ?? null, comps.hrv_base_ms ?? null, false)}
        series={hrvSeries}
        band={comps.hrv_base_ms ? { low: comps.hrv_base_ms * 0.85, high: comps.hrv_base_ms * 1.15 } : null}
        color={colors.recovery}
      />
      <MetricCard
        icon={HeartIcon}
        title="Resting HR"
        value={today?.daily.rhr != null ? String(today.daily.rhr) : "–"}
        unit="bpm"
        status={statusFor(today?.daily.rhr ?? null, comps.rhr_base ?? null, true)}
        series={rhrSeries}
        band={comps.rhr_base ? { low: comps.rhr_base - 3, high: comps.rhr_base + 3 } : null}
        color={colors.cardio}
      />
      <MetricCard
        icon={MoonIcon}
        title="Time asleep"
        value={hms(today?.sleep?.asleep_s)}
        status={today?.sleep?.asleep_s != null ? { label: today.sleep.asleep_s >= 7 * 3600 ? "On target" : "Short night", tone: today.sleep.asleep_s >= 7 * 3600 ? "good" : "bad" } : null}
        series={sleepSeries}
        band={{ low: 7, high: 9 }}
        color={colors.sleep}
      />

      <Text style={styles.section}>Today&apos;s workouts</Text>
      {today?.activities.length ? today.activities.map((a) => <WorkoutCard key={a.id} a={a} />) : (
        <Card>
          <Text style={styles.empty}>No workouts recorded today</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", gap: 8, marginBottom: spacing.lg, marginTop: -4 },
  ringCard: { paddingVertical: 22 },
  rings: { flexDirection: "row", justifyContent: "space-around", alignItems: "center" },
  divider: { width: StyleSheet.hairlineWidth, height: 70, backgroundColor: colors.hairline },
  calib: { ...font.caption, color: colors.recoveryAmber, textAlign: "center", marginTop: spacing.md },
  emptyWrap: { alignItems: "center", marginTop: spacing.lg },
  emptyTitle: { ...font.heading, color: colors.text },
  empty: { ...font.body, color: colors.textMuted, textAlign: "center", marginTop: 4 },
  section: { ...font.heading, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.md },
});
