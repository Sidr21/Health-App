import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Chip } from "@/components/Chip";
import { EnergyBar, MonitorTile, SectionTitle, StressCard, TimelineSleepCard } from "@/components/HomeWidgets";
import {
  BedIcon, ChevronDown, CloudIcon, DropIcon, HeartIcon, LungsIcon, PulseIcon, RunnerIcon, ShareIcon, SunIcon, ThermoIcon,
} from "@/components/icons";
import { Ring } from "@/components/Ring";
import { Screen } from "@/components/Screen";
import { Surface } from "@/components/Surface";
import { hms, pct } from "@/lib/format";
import { useDays } from "@/lib/useDays";
import { DEFAULT_LOCATION, fetchWeather } from "@/lib/weather";
import { bandColor, colors, font, radius, spacing } from "@/theme/tokens";

interface RecoveryComps {
  band?: "green" | "amber" | "red";
  hrv_ms?: number;
  hrv_base_ms?: number;
  rhr?: number;
  rhr_base?: number;
  calibrating?: boolean;
}

function headerDate(iso: string | undefined): string {
  if (!iso) return "Today";
  return `Today, ${new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}

function normal(value: number | null | undefined, base: number | null | undefined, tol = 0.08): string | null {
  if (value == null || base == null) return null;
  const rel = (value - base) / base;
  return Math.abs(rel) <= tol ? "Normal" : rel > 0 ? "Above normal" : "Below normal";
}

export default function HomeScreen() {
  const q = useDays(14);
  const today = q.days[q.days.length - 1];
  const weather = useQuery({ queryKey: ["weather"], queryFn: () => fetchWeather(), staleTime: 30 * 60_000 });
  const rec = today?.scores.recovery;
  const sleep = today?.scores.sleep;
  const comps = (rec?.components ?? {}) as RecoveryComps;
  const WeatherIcon = weather.data && weather.data.code >= 3 ? CloudIcon : SunIcon;
  const rhr = today?.daily.rhr ?? null;
  const asleep = today?.sleep?.asleep_s ?? null;

  return (
    <Screen refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <View style={styles.topBar}>
        <View style={styles.topPill}>
          <Pressable style={styles.topBtn}><ShareIcon size={18} color={colors.text} /></Pressable>
          <Pressable onPress={() => router.push("/settings")} style={styles.avatar}><Text style={styles.avatarText}>SR</Text></Pressable>
        </View>
      </View>
      <Pressable style={styles.titleRow}>
        <Text style={styles.title}>{headerDate(today?.date)}</Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.chips}>
        <Chip icon={<RunnerIcon size={16} color="#fff" />} iconBg={colors.run} title="Active" subtitle="Until changed" dropdown />
        <Chip
          icon={<WeatherIcon size={16} color={colors.stress} />}
          title={weather.data ? `${Math.round(weather.data.tempF)}°F` : "–°F"}
          subtitle={DEFAULT_LOCATION.name}
        />
      </View>

      <Surface radiusSize={radius.lg} style={styles.ringCard}>
        <View style={styles.ringCol}>
          <Ring label="Strain" progress={null} value="–%" color={colors.strain} hatched />
        </View>
        <View style={styles.divider} />
        <Pressable style={styles.ringCol} onPress={() => router.push("/recovery")}>
          <Ring label="Recovery" progress={rec ? rec.value / 100 : null} value={rec ? pct(rec.value) : "–%"} color={bandColor(comps.band)} />
        </Pressable>
        <View style={styles.divider} />
        <Pressable style={styles.ringCol} onPress={() => router.push("/sleep")}>
          <Ring label="Sleep" progress={sleep ? sleep.value / 100 : null} value={sleep ? pct(sleep.value) : "–%"} color={colors.sleep} />
        </Pressable>
      </Surface>
      {!today && !q.isLoading ? (
        <Surface style={styles.card}>
          <Text style={styles.emptyTitle}>Nothing to see yet!</Text>
          <Text style={styles.empty}>{q.isError ? `Cannot reach the backend (${String(q.error)})` : "Sync your COROS data to get insights about your Recovery state."}</Text>
        </Surface>
      ) : null}

      <SectionTitle title="Stress & Energy" />
      <StressCard avg={today?.daily.stress_avg ?? null} min={today?.daily.stress_min ?? null} max={today?.daily.stress_max ?? null} updated={today?.daily.stress_updated ?? null} />
      <EnergyBar pct={null} />

      <SectionTitle title="Health Monitor" />
      <View style={styles.grid}>
        <MonitorTile icon={LungsIcon} label="RR" value={null} frac={null} />
        <MonitorTile icon={HeartIcon} label="RHR" value={rhr != null ? String(rhr) : null} unit="bpm" status={normal(rhr, comps.rhr_base)} frac={rhr != null ? 1 - Math.max(0, Math.min(1, (rhr - 40) / 40)) : null} onPress={() => router.push("/recovery")} />
        <MonitorTile icon={PulseIcon} label="HRV" value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : null} unit="ms" status={normal(comps.hrv_ms, comps.hrv_base_ms)} frac={comps.hrv_ms != null ? Math.max(0, Math.min(1, comps.hrv_ms / 100)) : null} onPress={() => router.push("/recovery")} />
        <MonitorTile icon={DropIcon} label="SpO2" value={null} frac={null} />
        <MonitorTile icon={ThermoIcon} label="Temp" value={null} frac={null} />
        <MonitorTile
          icon={BedIcon}
          label="Sleep"
          value={asleep != null ? hms(asleep) : null}
          status={asleep != null ? (asleep >= 7 * 3600 ? "Normal" : "Short") : null}
          frac={asleep != null ? Math.min(1, asleep / (9 * 3600)) : null}
          color={asleep != null && asleep < 7 * 3600 ? colors.recoveryAmber : colors.recovery}
          onPress={() => router.push("/sleep")}
        />
      </View>

      <SectionTitle title="Timeline" sub={today?.sleep ? "1 event" : "0 events"} />
      {today?.sleep ? <TimelineSleepCard end={today.sleep.end} score={sleep?.value ?? null} asleepS={today.sleep.asleep_s} /> : null}
      {today?.activities.length ? (
        <Text style={styles.empty}>{today.activities.length} workout{today.activities.length > 1 ? "s" : ""} today · see Fitness</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.md },
  topPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)", borderRadius: radius.pill, padding: 4, paddingLeft: 10 },
  topBtn: { padding: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#CFE3FF", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontWeight: "700", color: "#2B4B7A" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md },
  title: { fontSize: 22, fontWeight: "600", color: colors.text, letterSpacing: -0.3 },
  chips: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  ringCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 18, paddingHorizontal: 0, marginBottom: spacing.md },
  ringCol: { flex: 1, alignItems: "center" },
  divider: { width: StyleSheet.hairlineWidth, height: 84, backgroundColor: "rgba(255,255,255,0.08)" },
  card: { marginBottom: spacing.md, alignItems: "center" },
  emptyTitle: { ...font.heading, color: colors.text },
  empty: { ...font.body, color: colors.textMuted, textAlign: "center", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
});
