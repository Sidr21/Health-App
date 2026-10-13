import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api } from "@/lib/api";
import { bmiCategory, bodyDelta, bodyValue, type BodyKey } from "@/lib/body";
import { height as fmtHeight } from "@/lib/units";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const RANGES = [
  { k: "30D", days: 30 },
  { k: "90D", days: 90 },
  { k: "1Y", days: 365 },
] as const;

const BMI_BANDS = [
  { lo: 10, hi: 18.5, label: "Under", color: colors.sleepRem },
  { lo: 18.5, hi: 25, label: "Healthy", color: colors.recovery },
  { lo: 25, hi: 30, label: "Over", color: colors.recoveryAmber },
  { lo: 30, hi: 40, label: "Obese", color: colors.recoveryRed },
];

function BmiScale({ bmi }: { bmi: number }) {
  const lo = 15;
  const hi = 35;
  const x = Math.max(0, Math.min(1, (bmi - lo) / (hi - lo)));
  return (
    <View style={{ marginTop: spacing.md }}>
      <View style={styles.bmiBar}>
        {BMI_BANDS.map((b) => (
          <View key={b.label} style={{ flex: Math.max(0, Math.min(hi, b.hi) - Math.max(lo, b.lo)), backgroundColor: b.color, opacity: 0.55 }} />
        ))}
      </View>
      <View style={[styles.bmiDot, { left: `${x * 100}%` }]} />
      <View style={styles.bmiLabels}>
        {[18.5, 25, 30].map((t) => (
          <Text key={t} style={[styles.axis, styles.bmiTick, { left: `${((t - lo) / (hi - lo)) * 100}%` }]}>{t}</Text>
        ))}
      </View>
    </View>
  );
}

export default function BodyMetricScreen() {
  const { metric } = useLocalSearchParams<{ metric: BodyKey }>();
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[2]);
  const q = useQuery({ queryKey: ["body"], queryFn: () => api.bodySummary(365) });
  const m = q.data?.metrics[metric];
  const [now] = useState(() => Date.now());
  const cutoff = new Date(now - range.days * 86_400_000).toISOString().slice(0, 10);
  const pts = (m?.series ?? []).filter((p) => p.date >= cutoff);
  const vals = pts.map((p) => Number(bodyValue(metric, p.value).value));
  const latest = bodyValue(metric, m?.latest?.value);
  const sub = metric === "bmi" ? bmiCategory(m?.latest?.value) : bodyDelta(metric, m?.change_30d);
  const stat = (label: string, v: number | null) => (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{v == null ? "–" : v.toFixed(1)}</Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <Backdrop glow="home" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title={m?.label ?? "Body"} subtitle={m?.latest ? `Latest ${new Date(`${m.latest.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : undefined} />
        <View style={styles.body}>
          <Surface style={styles.hero} radiusSize={radius.lg}>
            <Text style={styles.big}>{latest.value}<Text style={styles.unit}> {latest.unit}</Text></Text>
            {sub ? <Text style={styles.sub}>{sub}</Text> : null}
            {metric === "bmi" && m?.latest ? <BmiScale bmi={m.latest.value} /> : null}
            {metric === "bmi" ? (
              <Text style={styles.note}>
                {m?.method === "apple" ? "BMI as written by your scale." : `Computed from weight and height (${fmtHeight(q.data?.height_cm)}).`} BMI ignores muscle mass, so read it next to body fat.
              </Text>
            ) : null}
          </Surface>

          <View style={styles.ranges}>
            {RANGES.map((r) => (
              <Pressable key={r.k} onPress={() => setRange(r)} style={[styles.range, range.k === r.k && styles.rangeOn]}>
                <Text style={[styles.rangeText, range.k === r.k && { color: colors.text }]}>{r.k}</Text>
              </Pressable>
            ))}
          </View>

          <Surface style={styles.card}>
            {pts.length ? (
              <LineChart
                id="body"
                points={pts.map((p, i) => ({ x: i, y: vals[i] }))}
                color={colors.sleepRem}
                dots={pts.length < 20}
                height={170}
                yFormat={(v) => v.toFixed(metric === "weight_kg" || metric === "lean_mass_kg" ? 0 : 1)}
                xLabels={[
                  new Date(`${pts[0].date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                  new Date(`${pts[pts.length - 1].date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
                ]}
              />
            ) : (
              <Text style={styles.note}>No readings in this range. Weigh-ins from a smart scale reach here through Apple Health on the iPhone app.</Text>
            )}
            {pts.length === 1 ? <Text style={styles.note}>One reading so far. The trend line fills in as your scale syncs.</Text> : null}
          </Surface>

          {vals.length ? (
            <View style={styles.stats}>
              {stat("Low", Math.min(...vals))}
              {stat("Average", vals.reduce((a, b) => a + b, 0) / vals.length)}
              {stat("High", Math.max(...vals))}
            </View>
          ) : null}

          {pts.length ? (
            <>
              <SectionLabel title="Readings" note={`${pts.length} in range`} />
              <Surface style={styles.card}>
                {[...pts].reverse().slice(0, 12).map((p) => {
                  const v = bodyValue(metric, p.value);
                  return (
                    <View key={p.date} style={styles.reading}>
                      <Text style={styles.readingDate}>{new Date(`${p.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Text>
                      <Text style={styles.readingVal}>{v.value} {v.unit}</Text>
                    </View>
                  );
                })}
              </Surface>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { marginBottom: spacing.md, paddingVertical: spacing.lg },
  big: { fontFamily: fonts.numeral, fontSize: 48, color: colors.text },
  unit: { fontSize: 18, fontFamily: fonts.label, color: colors.textMuted },
  sub: { ...font.label, color: colors.textMuted, marginTop: 2 },
  note: { ...font.caption, color: colors.textMuted, marginTop: spacing.md, lineHeight: 17 },
  ranges: { flexDirection: "row", gap: 6, marginBottom: spacing.md },
  range: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center" },
  rangeOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  rangeText: { ...font.overline, fontSize: 11, color: colors.textMuted },
  card: { marginBottom: spacing.md },
  stats: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  stat: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.sm, padding: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  statLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  statValue: { fontFamily: fonts.numeral, fontSize: 20, color: colors.text, marginTop: 3 },
  reading: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.05)" },
  readingDate: { ...font.label, color: colors.textMuted },
  readingVal: { fontFamily: fonts.numeral, fontSize: 15, color: colors.text },
  bmiBar: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden" },
  bmiDot: { position: "absolute", top: -3, width: 16, height: 16, marginLeft: -8, borderRadius: 8, backgroundColor: colors.text, borderWidth: 3, borderColor: colors.bg },
  bmiLabels: { height: 16, marginTop: 6 },
  bmiTick: { position: "absolute", width: 30, marginLeft: -15, textAlign: "center" },
  axis: { fontFamily: fonts.numeral, fontSize: 11, color: colors.textFaint },
});
