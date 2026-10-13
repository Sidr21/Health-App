import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

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
  hr_pace: "Heart rate vs pace",
  vdot_race: "Race-like effort (VDOT)",
  critical_speed: "Critical speed",
  friel: "30-min hard effort",
  hr_at_cs: "HR at critical speed",
  prior: "89% of HRmax (prior)",
  performance: "from race-like efforts / critical speed",
  hr_pace_x_economy: "VO₂max × running economy",
  best_effort_floor: "your best recorded effort",
  hr_speed_line: "HR–pace line at LTHR",
};

function Note({ text, tone = "amber" }: { text: string; tone?: "amber" | "muted" }) {
  const c = tone === "amber" ? colors.recoveryAmber : colors.textMuted;
  return (
    <View style={[styles.note, { backgroundColor: tone === "amber" ? "rgba(247,201,72,0.08)" : "rgba(255,255,255,0.04)" }]}>
      <View style={[styles.noteDot, { backgroundColor: c }]} />
      <Text style={[styles.noteText, { color: c }]}>{text}</Text>
    </View>
  );
}

function Compare({ label, ours, coros, sub }: { label: string; ours: string | null; coros: string | null; sub?: string | null }) {
  return (
    <View style={styles.compare}>
      <Text style={styles.compareLabel}>{label}</Text>
      <View style={styles.compareCols}>
        <View style={styles.col}>
          <Text style={styles.colHead}>Ours</Text>
          <Text style={[styles.colVal, !ours && { color: colors.textFaint }]}>{ours ?? "—"}</Text>
          {sub ? <Text style={styles.method}>{sub}</Text> : null}
        </View>
        <View style={styles.col}>
          <Text style={styles.colHead}>COROS</Text>
          <Text style={[styles.colVal, { color: colors.textMuted }]}>{coros ?? "—"}</Text>
        </View>
      </View>
    </View>
  );
}

export default function FitnessModelsScreen() {
  const q = useQuery({ queryKey: ["fitness-models"], queryFn: api.fitnessModels });
  const m = q.data;
  const ours = m?.vo2max.ours;
  const coros = m?.vo2max.coros?.value ?? null;
  const shown = ours?.value ?? coros;

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Fitness models" subtitle="Our estimates next to COROS's" />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.text}>Cannot reach the backend ({String(q.error)})</Text> : null}

          <Surface style={styles.hero} radiusSize={radius.lg}>
            <Dial progress={shown != null ? Math.min(1, (shown - 30) / 40) : null} value={shown != null ? shown.toFixed(1) : "–"} label="VO₂max" caption={ours ? "ours" : "COROS"} color={colors.recovery} size={150} />
            <View style={{ flex: 1, gap: 6 }}>
              {ours?.ci ? <Text style={styles.heroLine}>Range {ours.ci[0]}–{ours.ci[1]}</Text> : null}
              {coros != null ? <Text style={styles.heroLine}>COROS says {coros}</Text> : null}
              {m?.vo2max.lower_bound ? <Text style={styles.text}>Your best hard effort proves at least {m.vo2max.lower_bound.value} (VDOT).</Text> : null}
              {m?.vo2max.status ? <Note text={m.vo2max.status} /> : null}
            </View>
          </Surface>
          {m && Object.keys(m.vo2max.parts).length ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>How ours is built</Text>
              {Object.entries(m.vo2max.parts).map(([k, v]) => (
                <View key={k} style={styles.row}>
                  <Text style={styles.rowLabel}>{METHOD[k] ?? k}</Text>
                  <Text style={styles.rowVal}>{v.toFixed(1)}</Text>
                </View>
              ))}
              <Text style={styles.text}>
                Estimators are blended by their uncertainty. Heart rate vs pace uses steady stretches of your runs (ACSM oxygen cost ÷ heart-rate reserve). Race-like efforts and critical speed join once your FIT files include them.
              </Text>
            </Surface>
          ) : null}

          <SectionLabel title="Max heart rate" />
          <Surface style={styles.card} onPress={() => router.push("/settings")}>
            <View style={styles.rowBetween}>
              <Text style={styles.big}>{m?.hr_max?.value ?? "–"}<Text style={styles.unit}> bpm</Text></Text>
              <Text style={styles.method}>{m?.hr_max ? METHOD[m.hr_max.method] ?? m.hr_max.method : ""}</Text>
            </View>
            {Object.entries(m?.hr_max?.candidates ?? {}).map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={styles.rowLabel}>{METHOD[k] ?? k}</Text>
                <Text style={styles.rowVal}>{v} bpm</Text>
              </View>
            ))}
            <Text style={styles.text}>Tap to set a field-test value.</Text>
          </Surface>

          <SectionLabel title="Threshold" />
          <Surface style={styles.card}>
            <Compare
              label="Threshold heart rate (LTHR)"
              ours={m?.lthr ? `${Math.round(m.lthr.value)} bpm` : null}
              coros={null}
              sub={m?.lthr ? (m.lthr.prior_only ? "prior only (89% HRmax)" : `range ${m.lthr.ci?.[0]}–${m.lthr.ci?.[1]}`) : null}
            />
            <Compare
              label="Threshold pace"
              ours={m?.threshold.ours_pace_s_per_km ? pace(m.threshold.ours_pace_s_per_km) : null}
              coros={m?.threshold.coros_pace_s_per_km ? pace(m.threshold.coros_pace_s_per_km.value) : null}
              sub={m?.threshold.pace_method ? METHOD[m.threshold.pace_method] ?? m.threshold.pace_method : null}
            />
            {m?.lthr?.prior_only ? (
              <Note text="LTHR is still the 89% HRmax prior. A 30-minute steady hard effort, or hard 3–20 minute efforts across two runs (critical speed), replaces it." />
            ) : null}
          </Surface>

          <SectionLabel title="Race predictions" />
          <Surface style={styles.card}>
            <View style={styles.raceHead}>
              <Text style={[styles.colHead, { flex: 1 }]} />
              <Text style={[styles.colHead, styles.raceCol]}>Ours</Text>
              <Text style={[styles.colHead, styles.raceCol]}>COROS</Text>
            </View>
            {(m?.races ?? []).map((r) => (
              <View key={r.key} style={styles.race}>
                <Text style={styles.raceName}>{r.label}</Text>
                <View style={styles.raceCol}>
                  <Text style={styles.raceTime}>{r.ours_s ? clockDuration(r.ours_s) : "–"}</Text>
                  {r.ours_s ? <Text style={styles.method}>{pace(r.ours_s / (r.distance_m / 1000))}</Text> : null}
                </View>
                <View style={styles.raceCol}>
                  <Text style={[styles.raceTime, { color: colors.textMuted }]}>{r.coros_s ? clockDuration(r.coros_s.value) : "–"}</Text>
                </View>
              </View>
            ))}
            {m?.prediction ? (
              <Text style={styles.text}>
                VDOT {m.prediction.vdot}, {METHOD[m.prediction.method] ?? m.prediction.method}
                {m.prediction.economy ? ` (economy ${m.prediction.economy.toFixed(2)})` : " (economy 0.88 until a race-like effort calibrates it)"}.
              </Text>
            ) : null}
          </Surface>

          {m ? <Text style={styles.footer}>{m.inputs.runs_with_streams} of {m.inputs.runs} runs have FIT streams · COROS running level {m.running_level ? Math.round(m.running_level.value) : "–"}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.md },
  heroLine: { fontFamily: fonts.numeral, fontSize: 18, color: colors.text },
  card: { marginBottom: spacing.md, gap: 8 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  big: { fontFamily: fonts.numeral, fontSize: 36, color: colors.text },
  unit: { fontSize: 15, fontFamily: fonts.label, color: colors.textMuted },
  method: { ...font.caption, color: colors.textFaint },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowLabel: { ...font.label, color: colors.textMuted },
  rowVal: { fontFamily: fonts.numeral, fontSize: 16, color: colors.text },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  note: { flexDirection: "row", gap: 8, alignItems: "flex-start", borderRadius: radius.sm, padding: 10 },
  noteDot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  noteText: { ...font.caption, flex: 1, lineHeight: 17 },
  compare: { paddingVertical: 4 },
  compareLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  compareCols: { flexDirection: "row", marginTop: 4 },
  col: { flex: 1 },
  colHead: { ...font.caption, color: colors.textMuted },
  colVal: { fontFamily: fonts.numeral, fontSize: 22, color: colors.text },
  raceHead: { flexDirection: "row" },
  race: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.05)" },
  raceName: { ...font.heading, fontSize: 15, color: colors.text, flex: 1 },
  raceCol: { width: 92, alignItems: "flex-end", textAlign: "right" },
  raceTime: { fontFamily: fonts.numeral, fontSize: 20, color: colors.text },
  footer: { ...font.caption, color: colors.textFaint, textAlign: "center", marginTop: spacing.sm },
});
