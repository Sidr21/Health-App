/**
 * Developer-only preview of components whose real data only arrives on the phone / Mac sync
 * (Apple Health sleep stages, FIT heart-rate streams). Everything here is synthetic and the
 * screen says so; it is not linked from the app and renders nothing in production builds.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { FocusBar, Hypnogram, LineChart, StageBar, ZONE_COLORS, ZoneBars } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import type { SleepSegmentOut, SleepStage, ZoneOut } from "@/lib/api";
import { colors, font, spacing } from "@/theme/tokens";

function syntheticNight(): SleepSegmentOut[] {
  const plan: [SleepStage, number][] = [
    ["awake", 8], ["light", 25], ["deep", 50], ["light", 20], ["rem", 18], ["light", 30], ["deep", 35],
    ["light", 25], ["rem", 28], ["awake", 4], ["light", 35], ["deep", 15], ["light", 20], ["rem", 35],
    ["light", 30], ["rem", 22], ["awake", 6],
  ];
  let t = Date.UTC(2026, 0, 1, 4, 0); // fixed fake night
  return plan.map(([stage, min]) => {
    const seg = { stage, start: new Date(t).toISOString(), end: new Date(t + min * 60_000).toISOString() };
    t += min * 60_000;
    return seg;
  });
}

function syntheticRun(): { x: number; y: number }[] {
  const out = [];
  for (let t = 0; t <= 2400; t += 10) {
    const effort = t < 2280 ? 128 + 44 * Math.min(1, t / 1800) + 4 * Math.sin(t / 90) : 172 - 38 * (1 - Math.exp(-(t - 2280) / 30));
    out.push({ x: t, y: Math.round(effort) });
  }
  return out;
}

const HRMAX = 192;
const ZONES: ZoneOut[] = [
  { zone: 1, name: "Recovery", lo_bpm: null, hi_bpm: 114, seconds: 60 },
  { zone: 2, name: "Endurance", lo_bpm: 115, hi_bpm: 133, seconds: 420 },
  { zone: 3, name: "Tempo", lo_bpm: 134, hi_bpm: 153, seconds: 780 },
  { zone: 4, name: "Threshold", lo_bpm: 154, hi_bpm: 172, seconds: 1020 },
  { zone: 5, name: "Max", lo_bpm: 173, hi_bpm: null, seconds: 120 },
];

export default function Gallery() {
  if (!__DEV__) return null;
  const night = syntheticNight();
  const secs = (st: SleepStage) => night.filter((s) => s.stage === st).reduce((a, s) => a + (Date.parse(s.end) - Date.parse(s.start)) / 1000, 0);
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: spacing.xxl }}>
      <DetailHeader title="Component preview" subtitle="synthetic data · dev only" mode="close" />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Made-up data to preview charts that need Apple Health sleep stages or FIT heart-rate streams. Not your data.</Text>
        </View>

        <SectionLabel title="Sleep stages · hypnogram" />
        <Surface tone="sleep" style={styles.card}>
          <Hypnogram segments={night} />
          <View style={{ height: spacing.lg }} />
          <StageBar parts={[{ stage: "deep", seconds: secs("deep") }, { stage: "light", seconds: secs("light") }, { stage: "rem", seconds: secs("rem") }, { stage: "awake", seconds: secs("awake") }]} />
        </Surface>

        <SectionLabel title="Workout · per-second heart rate" />
        <Surface style={styles.card}>
          <LineChart
            id="g-hr"
            points={syntheticRun()}
            color={colors.recoveryRed}
            height={170}
            bands={ZONES.map((z, i) => ({ lo: z.lo_bpm ?? 0, hi: z.hi_bpm ?? 250, color: ZONE_COLORS[i] }))}
            xLabels={["0:00", "40:00"]}
            marker={{ x: 2280, label: "−34 bpm in 60 s" }}
          />
        </Surface>
        <Surface style={styles.card}>
          <ZoneBars zones={ZONES} />
        </Surface>
        <Surface style={styles.card}>
          <FocusBar focus={{ low_aerobic: 20.8, high_aerobic: 75, anaerobic: 4.2 }} />
        </Surface>
        <Text style={styles.note}>HRmax {HRMAX} for the zone bands.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: "rgba(247,201,72,0.10)", borderRadius: 12, padding: 12, marginBottom: spacing.sm },
  bannerText: { ...font.caption, color: colors.recoveryAmber, lineHeight: 17 },
  card: { marginBottom: spacing.md },
  note: { ...font.caption, color: colors.textFaint },
});
