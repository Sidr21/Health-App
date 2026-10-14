import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { Dial } from "@/components/Dial";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { longDayLabel } from "@/lib/dates";
import { clockMinutes, comps, shortDate, timeLabel, type EnergyComps } from "@/lib/scores";
import { useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

function word(v: number): string {
  if (v >= 70) return "Charged";
  if (v >= 40) return "Steady";
  if (v >= 15) return "Running low";
  return "Empty";
}

function Term({ label, sub, v, color, plain }: { label: string; sub: string; v: number | null; color: string; plain?: boolean }) {
  return (
    <View style={styles.term}>
      <View style={{ flex: 1 }}>
        <Text style={styles.termLabel}>{label}</Text>
        <Text style={styles.method}>{sub}</Text>
      </View>
      <Text style={[styles.termVal, { color }]}>{v == null ? "–" : plain ? v.toFixed(0) : `${v > 0 ? "+" : ""}${v.toFixed(1)}`}</Text>
    </View>
  );
}

export default function EnergyScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const q = useDays(14, date);
  const today = q.days[q.days.length - 1];
  const sc = today?.scores.energy;
  const c = comps<EnergyComps>(today, "energy");
  const mins = clockMinutes((c?.timeline ?? []).map((p) => p.t));
  const points = (c?.timeline ?? []).map((p, i) => ({ x: mins[i], y: p.v }));
  const d = c?.drains;
  const unclamped = c && d ? c.start + d.awake + d.stress + d.calm + d.workouts : null;
  const history = q.days.map((day, i) => ({ x: i, y: day.scores.energy?.value ?? null }));

  return (
    <View style={styles.screen}>
      <Backdrop glow="green" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Energy" subtitle={today ? longDayLabel(today.date) : undefined} />
        <View style={styles.body}>
          <View style={styles.hero}>
            <Dial progress={sc ? sc.value / 100 : null} value={sc ? `${Math.round(sc.value)}` : "–"} caption={sc ? word(sc.value) : "Starts when you wake"} color={colors.energy} size={200} stroke={12} hatched={!sc} />
            {c ? <Text style={styles.heroSub}>as of {timeLabel(c.as_of)} · low today {Math.round(c.low)}</Text> : null}
          </View>

          {points.length > 1 ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>Today&apos;s bank</Text>
              <LineChart id="energyday" points={points} color={colors.energy} domain={[0, 100]} height={170} xLabels={[`woke ${timeLabel(c!.wake)}`, timeLabel(c!.as_of)]} bands={[{ lo: 0, hi: 15, color: colors.recoveryRed }]} />
            </Surface>
          ) : null}

          <SectionLabel title="Where it went" />
          <Surface style={styles.card}>
            <Term label="Started at" sub={c?.start_source === "recovery" ? "this morning's recovery" : "no recovery yet, so 70"} v={c ? c.start : null} color={colors.text} plain />
            <Term label="Being awake" sub="2 per hour" v={d?.awake ?? null} color={colors.recoveryAmber} />
            <Term label="Stress" sub="above 25 on COROS's scale, up to 4.5 per hour" v={d?.stress ?? null} color={colors.recoveryAmber} />
            <Term label="Calm" sub="stress under 25 refills 1 per hour" v={d?.calm ?? null} color={colors.recovery} />
            <Term label="Workouts" sub={c ? `0.25 per TRIMP · ${Math.round(c.workout_trimp)} TRIMP today` : "0.25 per TRIMP"} v={d?.workouts ?? null} color={colors.strain} />
            <View style={styles.rule} />
            <Term label="Now" sub={unclamped != null && unclamped < 0 ? `the bank stops at 0 (the terms add to ${unclamped.toFixed(0)})` : "the bank runs 0–100"} v={sc ? sc.value : null} color={colors.energy} plain />
            {!d && sc ? <Text style={styles.text}>The breakdown appears after the next recompute.</Text> : null}
          </Surface>

          <SectionLabel title="Last 2 weeks" note="latest value each day" />
          <Surface style={styles.card}>
            <LineChart id="energy14" points={history} color={colors.energy} dots domain={[0, 100]} height={140} xLabels={q.days.length ? [shortDate(q.days[0].date), "Today"] : undefined} />
            <Text style={styles.text}>Low days usually follow a red recovery: the bank starts low and a normal day empties it. Sleep refills it through tomorrow&apos;s recovery.</Text>
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
  term: { flexDirection: "row", alignItems: "center" },
  termLabel: { ...font.heading, fontSize: 15, color: colors.text },
  termVal: { fontFamily: fonts.numeral, fontSize: 20 },
  method: { ...font.caption, color: colors.textFaint },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
});
