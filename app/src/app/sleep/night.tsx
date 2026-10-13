import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { Hypnogram, StageBar } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { BedIcon, ClockIcon, HeartIcon, MoonIcon, PulseIcon, ZzzIcon } from "@/components/icons";
import { Ring } from "@/components/Ring";
import { GradeCell, Panel, gradeFor } from "@/components/Tiles";
import { hms } from "@/lib/format";
import { useDays } from "@/lib/useDays";
import { colors, font, radius, spacing } from "@/theme/tokens";

export default function PrimarySleepScreen() {
  const q = useDays(3);
  const today = q.days[q.days.length - 1];
  const s = today?.sleep;
  const sc = today?.scores.sleep;
  const comps = (sc?.components ?? {}) as Record<string, number>;
  const score = sc?.value ?? null;
  const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "–");
  const startLabel = s?.start ? `${new Date(s.start).toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "2-digit" })} at ${fmt(s.start)}` : "";
  const remFrac = s?.rem_s != null && s.asleep_s ? Math.min(1, s.rem_s / s.asleep_s / 0.25) : null;
  const deepFrac = s?.deep_s != null && s.asleep_s ? Math.min(1, s.deep_s / s.asleep_s / 0.2) : null;
  const segments = s?.segments ?? [];
  // with a timeline, sum the stages from it; otherwise use COROS's totals
  const fromSegments = (stage: string) =>
    segments.filter((x) => x.stage === stage).reduce((acc, x) => acc + (new Date(x.end).getTime() - new Date(x.start).getTime()) / 1000, 0);
  const stageSecs = segments.length
    ? { deep: fromSegments("deep"), light: fromSegments("light") + fromSegments("asleep"), rem: fromSegments("rem"), awake: fromSegments("awake") }
    : { deep: s?.deep_s ?? null, light: s?.light_s ?? null, rem: s?.rem_s ?? null, awake: s?.awake_s ?? null };

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

          <SectionLabel title="Sleep stages" note={segments.length ? "timeline from Apple Health" : "totals from COROS"} />
          <Panel tone="sleep">
            {segments.length ? (
              <View style={{ marginBottom: spacing.lg }}>
                <Hypnogram segments={segments} />
              </View>
            ) : null}
            <StageBar
              parts={[
                { stage: "deep", seconds: stageSecs.deep, typical: "13–23%" },
                { stage: "light", seconds: stageSecs.light, typical: "50–60%" },
                { stage: "rem", seconds: stageSecs.rem, typical: "20–25%" },
                { stage: "awake", seconds: stageSecs.awake, typical: "< 10%" },
              ]}
            />
            {!segments.length ? (
              <Text style={[styles.caption, { marginTop: spacing.md, marginBottom: 0 }]}>
                The minute-by-minute timeline appears once the iPhone app shares Apple Health sleep stages. COROS only reports totals.
              </Text>
            ) : null}
          </Panel>

          <SectionLabel title="Sleeping heart rate" />
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
});
