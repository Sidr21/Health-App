import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { Dial } from "@/components/Dial";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api } from "@/lib/api";
import { clockDuration, pace } from "@/lib/units";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const METHOD: Record<string, string> = {
  age_formula: "age formula",
  observed: "highest HR recorded",
  user: "set by you",
  field_test: "field test",
};

function Pending({ text }: { text: string }) {
  return (
    <View style={styles.pending}>
      <View style={styles.pendingDot} />
      <Text style={styles.pendingText}>{text}</Text>
    </View>
  );
}

function Compare({ label, ours, coros }: { label: string; ours: string | null; coros: string | null }) {
  return (
    <View style={styles.compare}>
      <Text style={styles.compareLabel}>{label}</Text>
      <View style={styles.compareCols}>
        <View style={styles.col}>
          <Text style={styles.colHead}>Ours</Text>
          <Text style={[styles.colVal, !ours && { color: colors.textFaint }]}>{ours ?? "—"}</Text>
        </View>
        <View style={styles.col}>
          <Text style={styles.colHead}>COROS</Text>
          <Text style={styles.colVal}>{coros ?? "—"}</Text>
        </View>
      </View>
    </View>
  );
}

export default function FitnessModelsScreen() {
  const q = useQuery({ queryKey: ["fitness-models"], queryFn: api.fitnessModels });
  const m = q.data;
  const vo2 = m?.vo2max.coros?.value ?? null;

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Fitness models" subtitle="Our estimates next to COROS's" />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.note}>Cannot reach the backend ({String(q.error)})</Text> : null}

          <Surface style={styles.hero} radiusSize={radius.lg}>
            <Dial progress={vo2 != null ? Math.min(1, (vo2 - 30) / 40) : null} value={vo2 != null ? String(Math.round(vo2)) : "–"} label="VO₂max" caption="COROS" color={colors.recovery} size={150} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.heroTitle}>VO₂max</Text>
              <Text style={styles.note}>
                Ours blends three estimators from steady runs: heart rate vs pace, the ACSM running equation and a Firstbeat-style model (DESIGN §6.5).
              </Text>
              {m ? <Pending text={m.vo2max.status} /> : null}
            </View>
          </Surface>

          <SectionLabel title="Max heart rate" />
          <Surface style={styles.card} onPress={() => router.push("/settings")}>
            <View style={styles.rowBetween}>
              <Text style={styles.big}>{m?.hr_max?.value ?? "–"}<Text style={styles.unit}> bpm</Text></Text>
              <Text style={styles.method}>{m?.hr_max ? METHOD[m.hr_max.method] ?? m.hr_max.method : ""}</Text>
            </View>
            {Object.entries(m?.hr_max?.candidates ?? {}).map(([k, v]) => (
              <View key={k} style={styles.cand}>
                <Text style={styles.candLabel}>{METHOD[k] ?? k}</Text>
                <Text style={styles.candVal}>{v} bpm</Text>
              </View>
            ))}
            <Text style={styles.note}>Zones on every workout use this until our threshold (LTHR) estimate lands. Tap to set a field-test value.</Text>
          </Surface>

          <SectionLabel title="Threshold" />
          <Surface style={styles.card}>
            <Compare label="Threshold pace" ours={m?.threshold.ours_pace_s_per_km ? pace(m.threshold.ours_pace_s_per_km) : null} coros={m?.threshold.coros_pace_s_per_km ? pace(m.threshold.coros_pace_s_per_km.value) : null} />
            <Compare label="Threshold HR (LTHR)" ours={m?.threshold.ours_lthr ? `${m.threshold.ours_lthr} bpm` : null} coros={null} />
            {m ? <Pending text={m.threshold.status} /> : null}
          </Surface>

          <SectionLabel title="Race predictions" />
          <Surface style={styles.card}>
            {(m?.races ?? []).map((r) => (
              <View key={r.key} style={styles.race}>
                <Text style={styles.raceName}>{r.label}</Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.raceTime}>{r.coros_s ? clockDuration(r.coros_s.value) : "–"}</Text>
                  <Text style={styles.method}>{r.coros_s ? `${pace(r.coros_s.value / (r.distance_m / 1000))} · COROS` : ""}</Text>
                </View>
              </View>
            ))}
            <Text style={styles.note}>Ours will come from your critical speed (best efforts from 3 to 30 minutes) with a Riegel fatigue curve, once FIT streams are synced.</Text>
          </Surface>

          {m?.running_level ? (
            <Pressable>
              <Text style={styles.footer}>COROS running level {Math.round(m.running_level.value)} · as of {m.running_level.date}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  heroTitle: { ...font.heading, color: colors.text },
  card: { marginBottom: spacing.md, gap: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  big: { fontFamily: fonts.numeral, fontSize: 36, color: colors.text },
  unit: { fontSize: 15, fontFamily: fonts.label, color: colors.textMuted },
  method: { ...font.caption, color: colors.textFaint },
  cand: { flexDirection: "row", justifyContent: "space-between" },
  candLabel: { ...font.label, color: colors.textMuted },
  candVal: { fontFamily: fonts.numeral, fontSize: 15, color: colors.textMuted },
  note: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  pending: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: "rgba(247,201,72,0.08)", borderRadius: radius.sm, padding: 10 },
  pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.recoveryAmber, marginTop: 5 },
  pendingText: { ...font.caption, color: colors.recoveryAmber, flex: 1, lineHeight: 17 },
  compare: { paddingVertical: 4 },
  compareLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  compareCols: { flexDirection: "row", marginTop: 4 },
  col: { flex: 1 },
  colHead: { ...font.caption, color: colors.textMuted },
  colVal: { fontFamily: fonts.numeral, fontSize: 22, color: colors.text },
  race: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.05)" },
  raceName: { ...font.heading, fontSize: 15, color: colors.text },
  raceTime: { fontFamily: fonts.numeral, fontSize: 22, color: colors.text },
  footer: { ...font.caption, color: colors.textFaint, textAlign: "center", marginTop: spacing.sm },
});
