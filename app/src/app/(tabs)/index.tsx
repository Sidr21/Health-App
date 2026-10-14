import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import { Chip } from "@/components/Chip";
import { Dial } from "@/components/Dial";
import { EnergyBar, MonitorTile, NotTrackedRow, StressCard, TimelineSleepCard } from "@/components/HomeWidgets";
import { SectionLabel } from "@/components/SectionLabel";
import { DatePickerSheet, MenuSheet } from "@/components/Sheet";
import { Sparkline } from "@/components/Sparkline";
import { WorkoutCard } from "@/components/WorkoutCard";
import {
  BedIcon, ChevronDown, CloudIcon, DropIcon, HeartIcon, LungsIcon, PulseIcon, RouteIcon, RunnerIcon, ShareIcon, SunIcon, ThermoIcon, WalkIcon,
  type IconProps,
} from "@/components/icons";
import { Screen } from "@/components/Screen";
import { Surface } from "@/components/Surface";
import { api, type DayPayload, type DayStatus } from "@/lib/api";
import { addDays } from "@/lib/dates";
import { hms, pct } from "@/lib/format";
import { useRefresh } from "@/lib/refresh";
import { todayIso, useDays } from "@/lib/useDays";
import { DEFAULT_LOCATION, fetchWeather } from "@/lib/weather";
import { bandColor, colors, font, fonts, radius, spacing } from "@/theme/tokens";

interface RecoveryComps {
  band?: "green" | "amber" | "red";
  hrv_ms?: number;
  hrv_base_ms?: number;
  rhr?: number;
  rhr_base?: number;
  calibrating?: boolean;
}

const STATUS: Record<DayStatus, { label: string; icon: React.ComponentType<IconProps>; color: string; sub: string }> = {
  active: { label: "Active", icon: RunnerIcon, color: colors.run, sub: "Training as normal" },
  rest_day: { label: "Rest day", icon: BedIcon, color: colors.sleep, sub: "Planned rest" },
  sick: { label: "Sick", icon: ThermoIcon, color: colors.recoveryAmber, sub: "Logged to the journal each day" },
  travel: { label: "Travel", icon: RouteIcon, color: colors.cardio, sub: "Jet lag and disrupted sleep" },
};

function kicker(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" });
}

function shareText(d: DayPayload): string {
  const parts = [new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })];
  const rec = d.scores.recovery?.value;
  const slp = d.scores.sleep?.value;
  const str = d.scores.strain?.value;
  const hrv = (d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms;
  if (rec != null) parts.push(`Recovery ${Math.round(rec)}%`);
  if (d.sleep?.asleep_s != null) parts.push(`Sleep ${hms(d.sleep.asleep_s)}${slp != null ? ` (${Math.round(slp)})` : ""}`);
  if (str != null) parts.push(`Strain ${str.toFixed(1)}`);
  if (hrv != null) parts.push(`HRV ${Math.round(hrv)} ms`);
  if (d.daily.rhr != null) parts.push(`RHR ${d.daily.rhr} bpm`);
  return parts.join(" · ");
}

function headerDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function normal(value: number | null | undefined, base: number | null | undefined, tol = 0.08): string | null {
  if (value == null || base == null) return null;
  const rel = (value - base) / base;
  return Math.abs(rel) <= tol ? "Normal" : rel > 0 ? "Above normal" : "Below normal";
}

export default function HomeScreen() {
  const refresh = useRefresh();
  const qc = useQueryClient();
  const now = todayIso();
  const [date, setDate] = useState(now);
  const isToday = date === now;
  const [picking, setPicking] = useState(false);
  const [statusMenu, setStatusMenu] = useState(false);
  const q = useDays(14, date);
  const today = q.byDate.get(date);
  const statusQ = useQuery({ queryKey: ["status"], queryFn: api.status });
  const setStatus = useMutation({
    mutationFn: api.putStatus,
    onSuccess: (data) => {
      qc.setQueryData(["status"], data);
      qc.invalidateQueries({ queryKey: ["days"] });
      qc.invalidateQueries({ queryKey: ["journal"] });
    },
  });
  const status: DayStatus = (isToday ? statusQ.data?.status : today?.status) ?? "active";
  const st = STATUS[status];
  const at = (pathname: "/strain" | "/recovery" | "/energy" | "/stress" | "/sleep" | "/sleep/night") => (isToday ? pathname : { pathname, params: { date } });
  const workoutDays = useDays(120);
  const marked = new Set(workoutDays.days.filter((d) => d.activities.length).map((d) => d.date));
  const weather = useQuery({ queryKey: ["weather"], queryFn: () => fetchWeather(), staleTime: 30 * 60_000 });
  const rec = today?.scores.recovery;
  const sleep = today?.scores.sleep;
  const strainSc = today?.scores.strain;
  const comps = (rec?.components ?? {}) as RecoveryComps;
  const WeatherIcon = weather.data && weather.data.code >= 3 ? CloudIcon : SunIcon;
  const rhr = today?.daily.rhr ?? null;
  const vit = today?.vitals ?? {};
  const nEvents = (today?.sleep ? 1 : 0) + (today?.activities.length ?? 0);
  const asleep = today?.sleep?.asleep_s ?? null;
  const hrvSeries = q.days.map((d) => ((d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null));
  const rhrSeries = q.days.map((d) => d.daily.rhr);
  const sleepSeries = q.days.map((d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null));

  return (
    <Screen refreshing={refresh.refreshing} onRefresh={refresh.onRefresh} notices={refresh.problems}>
      <View style={styles.topBar}>
        <View style={styles.topPill}>
          <Pressable style={styles.topBtn} disabled={!today} onPress={() => today && Share.share({ message: shareText(today) })} accessibilityLabel="Share today">
            <ShareIcon size={18} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => router.push("/settings")} style={styles.avatar}><Text style={styles.avatarText}>SR</Text></Pressable>
        </View>
      </View>
      <Text style={styles.kicker}>{kicker(date, now)}</Text>
      <Pressable style={styles.titleRow} onPress={() => setPicking(true)} accessibilityLabel="Pick a day">
        <Text style={styles.title}>{headerDate(date)}</Text>
        <ChevronDown size={18} color={colors.textMuted} />
      </Pressable>

      <View style={styles.chips}>
        <Chip
          icon={<st.icon size={16} color="#fff" />}
          iconBg={st.color}
          title={st.label}
          subtitle={isToday ? (status === "active" ? "Until changed" : statusQ.data?.since ? `Since ${new Date(`${statusQ.data.since}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "Until changed") : "That day"}
          dropdown={isToday}
          onPress={isToday ? () => setStatusMenu(true) : undefined}
        />
        {isToday ? (
          <Chip
            icon={<WeatherIcon size={16} color={colors.stress} />}
            title={weather.data ? `${Math.round(weather.data.tempF)}°F` : DEFAULT_LOCATION.name}
            subtitle={weather.data ? DEFAULT_LOCATION.name : "Weather unavailable"}
          />
        ) : (
          <Chip
            icon={<WalkIcon size={16} color={colors.energy} />}
            title={today?.daily.steps != null ? today.daily.steps.toLocaleString() : "–"}
            subtitle="Steps"
          />
        )}
      </View>

      <Surface radiusSize={radius.lg} style={styles.ringCard}>
        <View style={styles.dials}>
          <Pressable style={styles.ringCol} onPress={() => router.push(at("/strain"))}>
            <Dial label="Strain" progress={strainSc ? strainSc.value / 21 : null} value={strainSc ? strainSc.value.toFixed(1) : "–"} color={colors.strain} hatched={!strainSc} />
          </Pressable>
          <Pressable style={styles.ringCol} onPress={() => router.push(at("/recovery"))}>
            <Dial label="Recovery" progress={rec ? rec.value / 100 : null} value={rec ? pct(rec.value) : "–"} color={bandColor(comps.band)} />
          </Pressable>
          <Pressable style={styles.ringCol} onPress={() => router.push(at("/sleep"))}>
            <Dial label="Sleep" progress={sleep ? sleep.value / 100 : null} value={sleep ? pct(sleep.value) : "–"} color={colors.sleep} />
          </Pressable>
        </View>
      </Surface>

      <View style={styles.vitals}>
        <Surface style={styles.vital} onPress={() => router.push({ pathname: "/vital/[metric]", params: { metric: "hrv" } })}>
          <Text style={styles.vitalLabel}>HRV</Text>
          <Text style={styles.vitalValue}>{comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"}<Text style={styles.vitalUnit}> ms</Text></Text>
          <Sparkline values={hrvSeries} color={colors.recovery} width={84} height={26} band={comps.hrv_base_ms ? { low: comps.hrv_base_ms * 0.85, high: comps.hrv_base_ms * 1.15 } : null} />
        </Surface>
        <Surface style={styles.vital} onPress={() => router.push({ pathname: "/vital/[metric]", params: { metric: "rhr" } })}>
          <Text style={styles.vitalLabel}>Resting HR</Text>
          <Text style={styles.vitalValue}>{rhr ?? "–"}<Text style={styles.vitalUnit}> bpm</Text></Text>
          <Sparkline values={rhrSeries} color={colors.strain} width={84} height={26} band={comps.rhr_base ? { low: comps.rhr_base - 3, high: comps.rhr_base + 3 } : null} />
        </Surface>
        <Surface style={styles.vital} onPress={() => router.push(at("/sleep"))}>
          <Text style={styles.vitalLabel}>Sleep</Text>
          <Text style={styles.vitalValue}>{asleep != null ? hms(asleep) : "–"}</Text>
          <Sparkline values={sleepSeries} color={colors.sleep} width={84} height={26} band={{ low: 7, high: 9 }} />
        </Surface>
      </View>
      {!today && !q.isLoading ? (
        <Surface style={styles.card}>
          <Text style={styles.emptyTitle}>Nothing to see yet!</Text>
          <Text style={styles.empty}>{q.isError ? `Cannot reach the backend (${String(q.error)})` : "Sync your COROS data to get insights about your Recovery state."}</Text>
        </Surface>
      ) : null}

      <SectionLabel title="Stress & Energy" />
      <StressCard avg={today?.daily.stress_avg ?? null} min={today?.daily.stress_min ?? null} max={today?.daily.stress_max ?? null} updated={today?.daily.stress_updated ?? null} onPress={() => router.push(at("/stress"))} />
      <EnergyBar pct={today?.scores.energy?.value ?? null} onPress={() => router.push(at("/energy"))} />

      <SectionLabel title="Health Monitor" note="vs your 28-day normal" />
      <View style={styles.grid}>
        <MonitorTile
          icon={HeartIcon}
          label="Resting HR"
          value={rhr != null ? String(rhr) : null}
          unit="bpm"
          status={normal(rhr, comps.rhr_base)}
          range={rhr != null && comps.rhr_base ? { v: rhr, lo: comps.rhr_base - 3, hi: comps.rhr_base + 3, min: comps.rhr_base - 12, max: comps.rhr_base + 12 } : null}
          color={normal(rhr, comps.rhr_base) === "Normal" ? colors.recovery : colors.recoveryAmber}
          onPress={() => router.push({ pathname: "/vital/[metric]", params: { metric: "rhr" } })}
        />
        <MonitorTile
          icon={PulseIcon}
          label="HRV"
          value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : null}
          unit="ms"
          status={normal(comps.hrv_ms, comps.hrv_base_ms)}
          range={comps.hrv_ms != null && comps.hrv_base_ms ? { v: comps.hrv_ms, lo: comps.hrv_base_ms * 0.85, hi: comps.hrv_base_ms * 1.15, min: comps.hrv_base_ms * 0.5, max: comps.hrv_base_ms * 1.5 } : null}
          color={normal(comps.hrv_ms, comps.hrv_base_ms) === "Normal" ? colors.recovery : colors.recoveryAmber}
          onPress={() => router.push({ pathname: "/vital/[metric]", params: { metric: "hrv" } })}
        />
        <MonitorTile
          icon={BedIcon}
          label="Sleep"
          value={asleep != null ? hms(asleep) : null}
          status={asleep != null ? (asleep >= 7 * 3600 ? "Normal" : "Short") : null}
          range={asleep != null ? { v: asleep / 3600, lo: 7, hi: 9, min: 4, max: 11 } : null}
          color={asleep != null && asleep < 7 * 3600 ? colors.recoveryAmber : colors.recovery}
          onPress={() => router.push(at("/sleep"))}
        />
        <MonitorTile
          icon={PulseIcon}
          label="Stress"
          value={today?.daily.stress_avg != null ? String(today.daily.stress_avg) : null}
          unit="avg"
          status={today?.daily.stress_avg != null ? (today.daily.stress_avg <= 35 ? "Low" : today.daily.stress_avg <= 60 ? "Moderate" : "High") : null}
          range={today?.daily.stress_avg != null ? { v: today.daily.stress_avg, lo: 0, hi: 35, min: 0, max: 100 } : null}
          color={today?.daily.stress_avg != null && today.daily.stress_avg > 35 ? colors.recoveryAmber : colors.recovery}
          onPress={() => router.push(at("/stress"))}
        />
        {vit.resp_rate != null ? (
          <MonitorTile
            icon={LungsIcon}
            label="Resp. rate"
            value={vit.resp_rate.toFixed(1)}
            unit="/min"
            status={vit.resp_rate >= 12 && vit.resp_rate <= 20 ? "Normal" : "Unusual"}
            range={{ v: vit.resp_rate, lo: 12, hi: 20, min: 8, max: 26 }}
            color={vit.resp_rate >= 12 && vit.resp_rate <= 20 ? colors.recovery : colors.recoveryAmber}
          />
        ) : null}
        {vit.spo2_pct != null ? (
          <MonitorTile
            icon={DropIcon}
            label="SpO₂"
            value={vit.spo2_pct.toFixed(0)}
            unit="%"
            status={vit.spo2_pct >= 95 ? "Normal" : "Low"}
            range={{ v: vit.spo2_pct, lo: 95, hi: 100, min: 88, max: 100 }}
            color={vit.spo2_pct >= 95 ? colors.recovery : colors.recoveryAmber}
          />
        ) : null}
      </View>
      <NotTrackedRow
        items={[
          ...(vit.resp_rate == null ? [{ icon: LungsIcon, label: "Resp. rate" }] : []),
          ...(vit.spo2_pct == null ? [{ icon: DropIcon, label: "SpO₂" }] : []),
          { icon: ThermoIcon, label: "Skin temp" },
        ]}
      />

      <SectionLabel title="Timeline" note={`${nEvents} event${nEvents === 1 ? "" : "s"}`} />
      {today?.sleep ? <TimelineSleepCard date={isToday ? undefined : date} end={today.sleep.end} score={sleep?.value ?? null} asleepS={today.sleep.asleep_s} /> : null}
      {(today?.activities ?? []).map((a) => <WorkoutCard key={a.id} a={a} />)}

      <DatePickerSheet key={date} visible={picking} onClose={() => setPicking(false)} value={date} max={now} onChange={setDate} marked={marked} />
      <MenuSheet
        visible={statusMenu}
        onClose={() => setStatusMenu(false)}
        title="Today is…"
        items={(Object.keys(STATUS) as DayStatus[]).map((k) => ({
          label: STATUS[k].label,
          sub: STATUS[k].sub,
          icon: STATUS[k].icon,
          color: STATUS[k].color,
          selected: k === status,
          onPress: () => setStatus.mutate(k),
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.md },
  topPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)", borderRadius: radius.pill, padding: 4, paddingLeft: 10 },
  topBtn: { padding: 6 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.recovery, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 12, fontWeight: "700", color: "#0A2A1E" },
  kicker: { ...font.overline, color: colors.recovery, marginBottom: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, letterSpacing: -0.5 },
  chips: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  ringCard: { paddingVertical: 14, paddingHorizontal: 12, marginBottom: spacing.md },
  overline: { ...font.overline, color: colors.textFaint, marginLeft: 6, marginBottom: 2 },
  dials: { flexDirection: "row", alignItems: "center", justifyContent: "space-around" },
  ringCol: { flex: 1, alignItems: "center" },
  vitals: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  vital: { flex: 1, padding: 12, gap: 4 },
  vitalLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  vitalValue: { fontSize: 24, fontFamily: fonts.numeral, color: colors.text, fontVariant: ["tabular-nums"] },
  vitalUnit: { fontSize: 12, fontFamily: fonts.label, color: colors.textMuted },
  card: { marginBottom: spacing.md, alignItems: "center" },
  emptyTitle: { ...font.heading, color: colors.text },
  empty: { ...font.body, color: colors.textMuted, textAlign: "center", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start" },
});
