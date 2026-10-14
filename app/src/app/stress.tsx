import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { Dial } from "@/components/Dial";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api } from "@/lib/api";
import { longDayLabel } from "@/lib/dates";
import { hms } from "@/lib/format";
import { shortDate } from "@/lib/scores";
import { todayIso, useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

const LEVEL_COLOR: Record<string, string> = {
  Rest: colors.recovery,
  Low: "#9ADF7A",
  Medium: colors.stress,
  High: colors.recoveryRed,
};

/** minutes since local midnight from an ISO string that carries its own offset */
function localMinutes(iso: string): number {
  return Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
}

function clock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  return `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
}

export default function StressScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date ?? todayIso();
  const q = useQuery({ queryKey: ["stress", date], queryFn: () => api.stressDay(date) });
  const days = useDays(28, date);
  const st = q.data;
  const today = days.days[days.days.length - 1];
  const mean = st?.awake_mean ?? today?.scores.stress?.value ?? null;
  const pts = (st?.samples ?? []).map((p) => ({ x: localMinutes(p.t), y: p.v }));
  const awakeTotal = (st?.levels ?? []).reduce((a, l) => a + l.minutes, 0);
  const trend = days.days.map((d, i) => ({ x: i, y: d.scores.stress?.value ?? d.daily.stress_avg ?? null }));

  return (
    <View style={styles.screen}>
      <Backdrop glow="amber" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Stress" subtitle={longDayLabel(date)} />
        <View style={styles.body}>
          <View style={styles.hero}>
            <Dial progress={mean != null ? mean / 100 : null} value={mean != null ? `${Math.round(mean)}` : "–"} caption="Awake average" color={colors.stress} size={190} stroke={12} hatched={mean == null} />
            <Text style={styles.heroSub}>
              {st?.high_minutes != null ? `${hms(st.high_minutes * 60)} at 50 or above` : "No readings yet today"}
            </Text>
          </View>

          {pts.length > 1 ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>Through the day</Text>
              <LineChart
                id="stressday"
                points={pts}
                color={colors.stress}
                domain={[0, 100]}
                height={170}
                bands={[
                  { lo: 0, hi: 25, color: LEVEL_COLOR.Rest },
                  { lo: 51, hi: 75, color: LEVEL_COLOR.Medium },
                  { lo: 76, hi: 100, color: LEVEL_COLOR.High },
                ]}
                xLabels={[clock(pts[0].x), clock(pts[pts.length - 1].x)]}
              />
              <Text style={styles.text}>COROS measures stress from heart-rate variability every few minutes. Readings while you sleep are shown but left out of the average.</Text>
            </Surface>
          ) : null}

          <SectionLabel title="Time in each level" note="while awake" />
          <Surface style={styles.card}>
            {awakeTotal > 0 ? (
              <View style={styles.levelBar}>
                {(st?.levels ?? []).map((l) => (l.minutes ? <View key={l.name} style={{ flex: l.minutes, backgroundColor: LEVEL_COLOR[l.name] }} /> : null))}
              </View>
            ) : null}
            {(st?.levels ?? []).map((l, i, all) => (
              <View key={l.name} style={styles.levelRow}>
                <View style={[styles.dot, { backgroundColor: LEVEL_COLOR[l.name] }]} />
                <Text style={styles.levelName}>{l.name}</Text>
                <Text style={styles.method}>{l.from}–{i + 1 < all.length ? all[i + 1].from - 1 : 100}</Text>
                <Text style={styles.levelVal}>{hms(l.minutes * 60)}</Text>
              </View>
            ))}
            {!st?.levels.length || awakeTotal === 0 ? <Text style={styles.text}>No awake readings yet. They arrive with each COROS sync.</Text> : null}
          </Surface>

          <SectionLabel title="Last 4 weeks" note="awake average" />
          <Surface style={styles.card}>
            <LineChart id="stress28" points={trend} color={colors.stress} dots height={140} xLabels={days.days.length ? [shortDate(days.days[0].date), "Today"] : undefined} />
            <Text style={styles.text}>Days before our engine had samples show COROS&apos;s daily average instead.</Text>
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { alignItems: "center", marginBottom: spacing.lg, gap: 8 },
  heroSub: { ...font.label, color: colors.textMuted },
  card: { marginBottom: spacing.md, gap: 10 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  method: { ...font.caption, color: colors.textFaint, width: 56 },
  levelBar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 },
  levelRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  levelName: { ...font.heading, fontSize: 15, color: colors.text, flex: 1 },
  levelVal: { fontFamily: fonts.numeral, fontSize: 18, color: colors.text, width: 76, textAlign: "right" },
});
