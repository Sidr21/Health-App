import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { BIO_LABEL, ContributionBars, signed, toneOf } from "@/components/BioAge";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { Dial } from "@/components/Dial";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api, type BioAgeOut } from "@/lib/api";
import { shortDate } from "@/lib/scores";
import { colors, font, fonts, spacing } from "@/theme/tokens";

type Num = number | null | undefined;

const n = (v: unknown): number | null => (typeof v === "number" ? v : null);
const range = (r: [number | null, number | null] | undefined, unit = ""): string =>
  !r ? "–" : r[0] == null ? `under ${r[1]}${unit}` : r[1] == null ? `over ${r[0]}${unit}` : `${r[0]}–${r[1]}${unit}`;

function InputRow({ label, value, norm, good }: { label: string; value: string; norm: string; good: boolean | null }) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>{label}</Text>
      <Text style={[styles.inputVal, good == null ? null : { color: good ? colors.recovery : colors.recoveryAmber }]}>{value}</Text>
      <Text style={styles.inputNorm}>{norm}</Text>
    </View>
  );
}

function inputsTable(b: BioAgeOut) {
  const i = b.inputs ?? {};
  const nm = b.norms ?? {};
  const vo2 = n(i.vo2max);
  const rhr = n(i.rhr);
  const hrv = n(i.hrv_ms);
  const bmi = n(i.bmi);
  const fat = n(i.body_fat_pct);
  const sleepH = n(i.sleep_h);
  const sleepS = n(i.sleep_score);
  const met = n(i.met_min_week);
  const within = (v: Num, r?: [number | null, number | null]) =>
    v == null || !r ? null : (r[0] == null || v >= r[0]) && (r[1] == null || v <= r[1]);
  return [
    { label: "VO₂max", value: vo2 != null ? vo2.toFixed(1) : "–", norm: nm.vo2max ? `typical ${nm.vo2max}` : "", good: vo2 != null && nm.vo2max ? vo2 >= nm.vo2max : null },
    { label: "Resting HR", value: rhr != null ? `${rhr.toFixed(0)} bpm` : "–", norm: nm.rhr ? `typical ${nm.rhr}` : "", good: rhr != null && nm.rhr ? rhr <= nm.rhr : null },
    { label: "HRV", value: hrv != null ? `${hrv.toFixed(0)} ms` : "–", norm: nm.hrv_ms ? `typical ${nm.hrv_ms}` : "", good: hrv != null && nm.hrv_ms ? hrv >= nm.hrv_ms : null },
    { label: "BMI", value: bmi != null ? bmi.toFixed(1) : "–", norm: range(nm.bmi), good: within(bmi, nm.bmi) },
    { label: "Body fat", value: fat != null ? `${fat.toFixed(1)}%` : "–", norm: range(nm.body_fat_pct, "%"), good: within(fat, nm.body_fat_pct) },
    { label: "Sleep", value: sleepH != null ? `${sleepH.toFixed(1)} h` : "–", norm: range(nm.sleep_h, " h"), good: within(sleepH, nm.sleep_h) },
    { label: "Sleep score", value: sleepS != null ? sleepS.toFixed(0) : "–", norm: nm.sleep_score ? `${nm.sleep_score}+` : "", good: sleepS != null && nm.sleep_score ? sleepS >= nm.sleep_score : null },
    { label: "Activity", value: met != null ? `${Math.round(met)} MET-min/wk` : "–", norm: range(nm.met_min_week), good: met != null && nm.met_min_week?.[0] != null ? met >= nm.met_min_week[0] : null },
  ];
}

export default function BioAgeScreen() {
  const q = useQuery({ queryKey: ["bioage"], queryFn: api.bioage });
  const b = q.data;
  const delta = b?.delta ?? 0;
  const prev = b?.previous ?? null;
  const changes = b && prev
    ? Object.keys({ ...(b.contributions ?? {}), ...prev.contributions })
        .map((k) => ({ k, d: (b.contributions?.[k] ?? 0) - (prev.contributions[k] ?? 0) }))
        .filter((c) => Math.abs(c.d) >= 0.05)
        .sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
    : [];
  const hist = (b?.history ?? []).map((h, i) => ({ x: i, y: h.value }));

  return (
    <View style={styles.screen}>
      <Backdrop glow={delta <= -0.5 ? "green" : delta >= 0.5 ? "red" : "home"} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Biological age" subtitle={b?.date ? `as of ${shortDate(b.date)}` : undefined} />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.text}>Cannot reach the backend ({String(q.error)})</Text> : null}
          <View style={styles.hero}>
            <Dial
              progress={b?.value != null && b.age ? Math.max(0, Math.min(1, 0.5 - (b.value - b.age) / 20)) : null}
              value={b?.value != null ? b.value.toFixed(1) : "–"}
              caption={b?.value != null ? `${signed(delta)} years vs ${b.age?.toFixed(1)}` : "Needs a few weeks of data"}
              color={toneOf(delta) === colors.textMuted ? colors.recovery : toneOf(delta)}
              size={200}
              stroke={12}
              hatched={b?.value == null}
            />
            {b?.fitness_age != null ? <Text style={styles.heroSub}>Fitness age {b.fitness_age.toFixed(1)}</Text> : null}
          </View>

          {b?.value != null ? (
            <>
              <SectionLabel title="This week" note={prev ? `vs ${shortDate(prev.date)}` : undefined} />
              <Surface style={styles.card}>
                {prev ? (
                  <>
                    <View style={styles.changeHead}>
                      <Text style={styles.big}>{signed(b.value - prev.value)}<Text style={styles.unit}> years</Text></Text>
                      <Text style={styles.method}>{prev.value.toFixed(1)} → {b.value.toFixed(1)}</Text>
                    </View>
                    {changes.length ? changes.map((c) => (
                      <View key={c.k} style={styles.changeRow}>
                        <Text style={styles.inputLabel}>{BIO_LABEL[c.k] ?? c.k}</Text>
                        <Text style={[styles.changeVal, { color: toneOf(c.d) }]}>{signed(c.d, 2)} y</Text>
                      </View>
                    )) : <Text style={styles.text}>No input moved it by more than a few weeks.</Text>}
                  </>
                ) : (
                  <Text style={styles.text}>Week-on-week changes start once there is a value from a week ago.</Text>
                )}
              </Surface>

              <SectionLabel title="What sets it" note="years added or removed" />
              <Surface style={styles.card}>
                <ContributionBars contributions={b.contributions ?? {}} />
                <Text style={styles.text}>
                  45% comes from fitness age: the age at which your VO₂max ({b.vo2max_source === "coros" ? "COROS's" : "ours"}) would be typical (FRIEND registry). The rest is your age moved by resting HR, HRV, body composition, sleep and activity. Missing inputs are left out, not guessed.
                </Text>
              </Surface>

              <SectionLabel title="Inputs" note="30-day averages" />
              <Surface style={styles.card}>
                {inputsTable(b).map((r) => <InputRow key={r.label} {...r} />)}
              </Surface>

              {hist.length > 1 ? (
                <>
                  <SectionLabel title="History" note="weekly" />
                  <Surface style={styles.card}>
                    <LineChart id="bioage" points={hist} color={colors.recovery} dots height={140} yFormat={(v) => v.toFixed(1)} xLabels={[shortDate(b.history[0].date), shortDate(b.history[b.history.length - 1].date)]} />
                  </Surface>
                </>
              ) : null}
            </>
          ) : null}
          <Text style={styles.footer}>Transparent and reproducible, not a medical measure.</Text>
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
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  method: { ...font.caption, color: colors.textFaint },
  big: { fontFamily: fonts.numeral, fontSize: 28, color: colors.text },
  unit: { fontSize: 13, fontFamily: fonts.label, color: colors.textMuted },
  changeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  changeRow: { flexDirection: "row", justifyContent: "space-between" },
  changeVal: { fontFamily: fonts.numeral, fontSize: 16 },
  inputRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  inputLabel: { ...font.label, color: colors.textMuted, flex: 1 },
  inputVal: { fontFamily: fonts.numeral, fontSize: 16, color: colors.text },
  inputNorm: { ...font.caption, color: colors.textFaint, width: 96, textAlign: "right" },
  footer: { ...font.caption, color: colors.textFaint, textAlign: "center", marginTop: spacing.sm },
});
