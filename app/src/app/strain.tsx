import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { Dial } from "@/components/Dial";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { longDayLabel } from "@/lib/dates";
import { comps, METHOD_LABEL, shortDate, timeLabel, type StrainComps } from "@/lib/scores";
import { sportMeta } from "@/lib/sport";
import { useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

const BANDS = [
  { lo: 0, hi: 6, name: "Light" },
  { lo: 6, hi: 11, name: "Moderate" },
  { lo: 11, hi: 15, name: "High" },
  { lo: 15, hi: 21, name: "All out" },
];

export default function StrainScreen() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const q = useDays(28, date);
  const today = q.days[q.days.length - 1];
  const sc = today?.scores.strain;
  const c = comps<StrainComps>(today, "strain");
  const series = q.days.map((d, i) => ({ x: i, y: d.scores.strain?.value ?? null }));
  const vals = series.map((p) => p.y).filter((v): v is number => v != null);
  const week = vals.slice(-7);
  const weekAvg = week.length ? week.reduce((a, b) => a + b, 0) / week.length : null;
  const monthAvg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const workoutTrimp = (c?.workouts ?? []).reduce((a, w) => a + w.trimp, 0);

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Strain" subtitle={today ? longDayLabel(today.date) : undefined} />
        <View style={styles.body}>
          <View style={styles.hero}>
            <Dial progress={sc ? sc.value / 21 : null} value={sc ? sc.value.toFixed(1) : "–"} caption={c?.band ?? "No load yet"} color={colors.strain} size={200} stroke={12} hatched={!sc} />
            <Text style={styles.heroSub}>{c ? `${Math.round(c.trimp)} TRIMP today` : "Strain builds as you move and train."}</Text>
          </View>

          <View style={styles.bands}>
            {BANDS.map((b) => {
              const on = sc != null && sc.value >= b.lo && (sc.value < b.hi || b.hi === 21);
              return (
                <View key={b.name} style={[styles.bandCell, on && { borderColor: colors.strain, backgroundColor: "rgba(61,139,255,0.12)" }]}>
                  <Text style={[styles.bandName, on && { color: colors.text }]}>{b.name}</Text>
                  <Text style={styles.bandRange}>{b.lo}–{b.hi}</Text>
                </View>
              );
            })}
          </View>

          <SectionLabel title="What built it" />
          <Surface style={styles.card}>
            {(c?.workouts ?? []).map((w) => {
              const meta = sportMeta(w.sport_code, w.sport);
              return (
                <Pressable key={w.id} style={styles.item} onPress={() => router.push(`/workout/${w.id}`)}>
                  <View style={[styles.icon, { backgroundColor: `${meta.color}22` }]}><meta.Icon size={16} color={meta.color} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemTitle}>{meta.name}</Text>
                    <Text style={styles.method}>{timeLabel(w.start)} · {METHOD_LABEL[w.method]}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.itemVal}>{w.strain.toFixed(1)}</Text>
                    <Text style={styles.method}>{Math.round(w.trimp)} TRIMP</Text>
                  </View>
                </Pressable>
              );
            })}
            <View style={styles.item}>
              <View style={[styles.icon, { backgroundColor: "rgba(86,224,255,0.13)" }]}><Text style={{ color: colors.energy, fontFamily: fonts.numeral }}>⋯</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>Moving around</Text>
                <Text style={styles.method}>{c?.steps != null ? `${c.steps.toLocaleString()} steps, minus those in workouts` : "No step count yet"}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.itemVal}>{c ? Math.round(c.step_trimp) : "–"}</Text>
                <Text style={styles.method}>TRIMP</Text>
              </View>
            </View>
            {c && c.trimp > 0 ? (
              <View style={styles.split}>
                <View style={[styles.splitBar, { flex: workoutTrimp || 0.0001, backgroundColor: colors.strain }]} />
                <View style={[styles.splitBar, { flex: c.step_trimp || 0.0001, backgroundColor: colors.energy }]} />
              </View>
            ) : null}
            <Text style={styles.text}>
              Strain = 21 × (1 − e^(−TRIMP / 150)). TRIMP weights each minute by how far your heart rate sits between resting and max{c?.hr_max ? ` (${c.hr_max} bpm)` : ""}, rising steeply near the top, so hard minutes count far more than easy ones.
            </Text>
          </Surface>

          <SectionLabel title="Last 4 weeks" />
          <Surface style={styles.card}>
            <View style={styles.statRow}>
              <View style={styles.stat}><Text style={styles.statVal}>{weekAvg != null ? weekAvg.toFixed(1) : "–"}</Text><Text style={styles.method}>7-day average</Text></View>
              <View style={styles.stat}><Text style={styles.statVal}>{monthAvg != null ? monthAvg.toFixed(1) : "–"}</Text><Text style={styles.method}>28-day average</Text></View>
              <View style={styles.stat}><Text style={styles.statVal}>{vals.length ? Math.max(...vals).toFixed(1) : "–"}</Text><Text style={styles.method}>highest</Text></View>
            </View>
            <LineChart id="strain28" points={series} color={colors.strain} dots domain={[0, 21]} height={160} xLabels={q.days.length ? [shortDate(q.days[0].date), "Today"] : undefined} yFormat={(v) => v.toFixed(0)} />
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
  bands: { flexDirection: "row", gap: 6, marginBottom: spacing.sm },
  bandCell: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, paddingVertical: 8, alignItems: "center" },
  bandName: { ...font.overline, fontSize: 10, color: colors.textMuted },
  bandRange: { fontFamily: fonts.numeral, fontSize: 13, color: colors.textFaint, marginTop: 2 },
  card: { marginBottom: spacing.md, gap: 12 },
  item: { flexDirection: "row", alignItems: "center", gap: 12 },
  icon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  itemTitle: { ...font.heading, fontSize: 15, color: colors.text },
  itemVal: { fontFamily: fonts.numeral, fontSize: 20, color: colors.text },
  method: { ...font.caption, color: colors.textFaint },
  split: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", gap: 2 },
  splitBar: { height: 8 },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  statRow: { flexDirection: "row" },
  stat: { flex: 1 },
  statVal: { fontFamily: fonts.numeral, fontSize: 24, color: colors.text },
});
