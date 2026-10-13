import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { Surface } from "@/components/Surface";
import { BedIcon, ClockIcon, HeartIcon, MoonIcon, PulseIcon, ZzzIcon } from "@/components/icons";
import { Ring } from "@/components/Ring";
import { GradeCell, Panel, gradeFor } from "@/components/Tiles";
import { hms } from "@/lib/format";
import { useDays } from "@/lib/useDays";
import { colors, font, radius, spacing } from "@/theme/tokens";
import Svg, { Circle } from "react-native-svg";

function MiniRing({ frac, color }: { frac: number; color: string }) {
  const r = 12;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={32} height={32} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={r} stroke="rgba(0,0,0,0.35)" strokeWidth={4} fill="none" />
      <Circle cx={16} cy={16} r={r} stroke={color} strokeWidth={4} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.min(1, frac))} transform="rotate(-90 16 16)" strokeLinecap="round" />
    </Svg>
  );
}

function StageCard({ label, seconds, total, color }: { label: string; seconds: number | null; total: number | null; color: string }) {
  const frac = seconds != null && total ? seconds / total : 0;
  return (
    <Surface tone="sleep" style={styles.stage}>
      <View style={{ flex: 1 }}>
        <Text style={styles.stageLabel}>{label}</Text>
        <Text style={styles.stageValue}>{hms(seconds)}</Text>
        <Text style={[styles.stagePct, { color }]}>{Math.round(frac * 100)}%</Text>
      </View>
      <MiniRing frac={frac} color={color} />
    </Surface>
  );
}

export default function PrimarySleepScreen() {
  const q = useDays(3);
  const today = q.days[q.days.length - 1];
  const s = today?.sleep;
  const sc = today?.scores.sleep;
  const comps = (sc?.components ?? {}) as Record<string, number>;
  const score = sc?.value ?? null;
  const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "–");
  const startLabel = s?.start ? `${new Date(s.start).toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" })} at ${fmt(s.start)}` : "";
  const total = s?.in_bed_s ?? ((s?.asleep_s ?? 0) + (s?.awake_s ?? 0));
  const remFrac = s?.rem_s != null && s.asleep_s ? Math.min(1, s.rem_s / s.asleep_s / 0.25) : null;
  const deepFrac = s?.deep_s != null && s.asleep_s ? Math.min(1, s.deep_s / s.asleep_s / 0.2) : null;

  return (
    <View style={styles.screen}>
      <Backdrop glow="sleep" bg={colors.sleepBg} height={420} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="" mode="close" />
        <View style={styles.body}>
          <Text style={styles.title}>Primary sleep</Text>
          <Text style={styles.subtitle}>{startLabel}</Text>

          <Surface tone="sleep" style={[styles.rowCard, { marginTop: spacing.lg }]}>
            <Text style={styles.rowText}>Sleep Score</Text>
            <Text style={styles.rowValue}>{score != null ? `${Math.round(score)}%` : "–"}</Text>
            <Ring progress={score != null ? score / 100 : null} value="" color={colors.sleep} size={30} stroke={5} marker={false} trackColor="rgba(0,0,0,0.35)" />
          </Surface>

          <Panel tone="sleep" style={{ padding: 10 }}>
            <View style={[styles.rowCard, styles.inner]}>
              <BedIcon size={14} color={colors.textMuted} />
              <Text style={styles.rowText}>Sleep Period</Text>
              <Text style={styles.rowValueSm}>{fmt(s?.start)} - {fmt(s?.end)}</Text>
            </View>
            <View style={[styles.inner, styles.twoUp]}>
              <View style={styles.half}><Text style={styles.label}>Time In Bed</Text><Text style={styles.big}>{hms(s?.in_bed_s)}</Text></View>
              <View style={styles.half}><Text style={styles.label}>Time Asleep</Text><Text style={styles.big}>{hms(s?.asleep_s)}</Text></View>
            </View>
            <View style={[styles.inner, styles.grades]}>
              <GradeCell icon={ClockIcon} grade={gradeFor(comps.duration)} label="Time Asleep" frac={comps.duration ?? null} />
              <GradeCell icon={HeartIcon} grade={gradeFor(comps.hr_dip)} label="Heart Rate Dip" frac={comps.hr_dip ?? null} />
              <GradeCell icon={MoonIcon} grade={gradeFor(remFrac)} label="REM Sleep" frac={remFrac} />
              <GradeCell icon={ZzzIcon} grade={gradeFor(deepFrac)} label="Deep Sleep" frac={deepFrac} />
              <GradeCell icon={PulseIcon} grade={gradeFor(comps.efficiency)} label="Efficiency" frac={comps.efficiency ?? null} />
              <GradeCell icon={BedIcon} grade={gradeFor(comps.continuity)} label="Continuity" frac={comps.continuity ?? null} />
            </View>
          </Panel>

          <Text style={styles.section}>Sleep Stages</Text>
          <Text style={styles.caption}>Duration: {hms(total)} · stage timeline needs the FIT sleep record (phase 1)</Text>
          <View style={styles.stageGrid}>
            <StageCard label="Awake" seconds={s?.awake_s ?? null} total={total} color={colors.sleepAwake} />
            <StageCard label="REM" seconds={s?.rem_s ?? null} total={total} color={colors.sleepRem} />
            <StageCard label="Core" seconds={s?.light_s ?? null} total={total} color={colors.sleep} />
            <StageCard label="Deep" seconds={s?.deep_s ?? null} total={total} color={colors.sleepDeep} />
          </View>

          <Text style={styles.section}>Sleeping Heart Rate</Text>
          <Panel tone="sleep">
            <Text style={styles.big}>{s?.hr_avg ?? "–"} <Text style={styles.label}>bpm</Text></Text>
            <Text style={styles.caption}>AVERAGE HR · min {s?.hr_min ?? "–"} bpm. The overnight curve needs the FIT sleep record.</Text>
          </Panel>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sleepBg },
  body: { paddingHorizontal: spacing.lg },
  title: { fontSize: 24, fontWeight: "700", color: colors.text },
  subtitle: { ...font.body, color: colors.textMuted, marginTop: 2 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: spacing.md },
  inner: { backgroundColor: "rgba(255,255,255,0.07)", marginBottom: 8, borderRadius: radius.sm, padding: spacing.lg },
  rowText: { ...font.heading, fontSize: 15, color: colors.text, flex: 1 },
  rowValue: { ...font.heading, fontSize: 15, color: colors.text },
  rowValueSm: { ...font.label, color: colors.text },
  twoUp: { flexDirection: "row", padding: spacing.lg },
  half: { flex: 1, alignItems: "center" },
  label: { ...font.label, color: colors.textMuted },
  big: { ...font.number, fontSize: 24, color: colors.text, marginTop: 4 },
  grades: { flexDirection: "row", flexWrap: "wrap", paddingVertical: 6 },
  section: { ...font.heading, fontSize: 17, color: colors.text, marginTop: spacing.lg, marginBottom: 4 },
  caption: { ...font.caption, color: colors.textMuted, marginBottom: spacing.md },
  stageGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  stage: { width: "48%", flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  stageLabel: { ...font.label, color: colors.textMuted },
  stageValue: { ...font.number, fontSize: 20, color: colors.text, marginTop: 4 },
  stagePct: { ...font.label, marginTop: 2 },
});
