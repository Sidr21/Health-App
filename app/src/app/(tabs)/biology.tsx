import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Header, RoundButton } from "@/components/Header";
import { DotsIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/SectionLabel";
import { Sparkline } from "@/components/Sparkline";
import { Surface } from "@/components/Surface";
import { api } from "@/lib/api";
import { bmiCategory, bodyDelta, bodyValue, displaySeries, type BodyKey } from "@/lib/body";
import { hms } from "@/lib/format";
import { useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

function Tile({ title, value, unit, series, color, sub }: { title: string; value: string; unit?: string; series: (number | null)[]; color: string; sub?: string }) {
  return (
    <Card style={styles.half}>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileValue}>
        {value}
        {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
      </Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
      <View style={{ marginTop: 8 }}>
        <Sparkline values={series} color={color} width={130} height={40} />
      </View>
    </Card>
  );
}

const BIO_LABEL: Record<string, string> = {
  vo2max: "VO₂max",
  rhr: "Resting HR",
  hrv: "HRV",
  body: "Body composition",
  sleep: "Sleep",
  activity: "Activity",
};

function BioAgeCard() {
  const q = useQuery({ queryKey: ["bioage"], queryFn: api.bioage });
  const b = q.data;
  if (!b || b.value == null) {
    return (
      <Card>
        <Text style={styles.body}>
          From VO₂max, resting HR, HRV, body composition, sleep and activity. Appears once there are a few weeks of data.
        </Text>
      </Card>
    );
  }
  const delta = b.delta ?? 0;
  const tone = delta <= -0.5 ? colors.recovery : delta >= 0.5 ? colors.recoveryRed : colors.textMuted;
  const contribs = Object.entries(b.contributions ?? {}).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const scale = Math.max(1, ...contribs.map(([, v]) => Math.abs(v)));
  return (
    <Surface style={styles.bio}>
      <View style={styles.bioTop}>
        <Text style={styles.bioValue}>{b.value.toFixed(1)}<Text style={styles.tileUnit}> years</Text></Text>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.bioDelta, { color: tone }]}>{delta > 0 ? "+" : ""}{delta.toFixed(1)} y</Text>
          <Text style={styles.tileSub}>vs age {b.age?.toFixed(1)}</Text>
        </View>
      </View>
      {b.fitness_age != null ? (
        <Text style={styles.tileSub}>Fitness age {b.fitness_age.toFixed(1)} from VO₂max {String(b.inputs?.vo2max ?? "–")} ({b.vo2max_source === "coros" || b.vo2max_source === "COROS" ? "COROS" : "our estimate"})</Text>
      ) : null}
      <View style={{ gap: 8, marginTop: 6 }}>
        {contribs.map(([k, v]) => (
          <View key={k} style={styles.contrib}>
            <Text style={styles.contribLabel}>{BIO_LABEL[k] ?? k}</Text>
            <View style={styles.contribTrack}>
              <View style={styles.contribMid} />
              <View
                style={[
                  styles.contribBar,
                  {
                    width: `${(Math.abs(v) / scale) * 50}%`,
                    backgroundColor: v < 0 ? colors.recovery : colors.recoveryRed,
                    ...(v < 0 ? { right: "50%" } : { left: "50%" }),
                  },
                ]}
              />
            </View>
            <Text style={[styles.contribVal, { color: v < 0 ? colors.recovery : v > 0 ? colors.recoveryRed : colors.textMuted }]}>
              {v > 0 ? "+" : ""}{v.toFixed(1)}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[styles.tileSub, { marginTop: 4, lineHeight: 16 }]}>
        Years each input adds or removes. Fitness weighs 45%; inputs without data are left out rather than guessed.
      </Text>
    </Surface>
  );
}

export default function BiologyScreen() {
  const q = useDays(28);
  const latest = q.days[q.days.length - 1];
  const comps = (latest?.scores.recovery?.components ?? {}) as { hrv_ms?: number };
  const body = useQuery({ queryKey: ["body"], queryFn: () => api.bodySummary(365) });
  return (
    <Screen refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <Header centered title="Biology" left={<View style={{ width: 44 }} />} right={<RoundButton><DotsIcon size={20} color={colors.text} /></RoundButton>} />
      <SectionLabel title="Vitals" note="last 28 days" />
      <View style={styles.grid}>
        <Tile title="Resting HRV" value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"} unit="ms" series={q.days.map((d) => ((d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null))} color={colors.recovery} />
        <Tile title="Resting HR" value={latest?.daily.rhr != null ? String(latest.daily.rhr) : "–"} unit="bpm" series={q.days.map((d) => d.daily.rhr)} color={colors.cardio} />
        <Tile title="Sleep HR" value={latest?.sleep?.hr_avg != null ? String(latest.sleep.hr_avg) : "–"} unit="bpm" series={q.days.map((d) => d.sleep?.hr_avg ?? null)} color={colors.sleep} />
        <Tile title="Stress" value={latest?.daily.stress_avg != null ? String(latest.daily.stress_avg) : "–"} series={q.days.map((d) => d.daily.stress_avg)} color={colors.stress} sub="daily average" />
        <Tile title="Time asleep" value={hms(latest?.sleep?.asleep_s)} series={q.days.map((d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null))} color={colors.sleepDeep} />
        <Tile title="Steps" value={latest?.daily.steps != null ? latest.daily.steps.toLocaleString() : "–"} series={q.days.map((d) => d.daily.steps)} color={colors.energy} />
      </View>
      <SectionLabel title="Body" note={body.data?.metrics.weight_kg.latest ? `latest ${new Date(`${body.data.metrics.weight_kg.latest.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : undefined} />
      <View style={styles.grid}>
        {(["weight_kg", "bmi", "body_fat_pct", "lean_mass_kg"] as BodyKey[]).map((k) => {
          const m = body.data?.metrics[k];
          const v = bodyValue(k, m?.latest?.value);
          const sub = k === "bmi" ? bmiCategory(m?.latest?.value) : bodyDelta(k, m?.change_30d);
          return (
            <Surface key={k} style={[styles.half, styles.bodyTile]} onPress={() => router.push({ pathname: "/body/[metric]", params: { metric: k } })}>
              <Text style={styles.tileTitle}>{m?.label ?? k}</Text>
              {m?.latest ? (
                <>
                  <Text style={styles.tileValue}>{v.value}{v.unit ? <Text style={styles.tileUnit}> {v.unit}</Text> : null}</Text>
                  {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
                  {m.series.length > 1 ? (
                    <View style={{ marginTop: 8 }}>
                      <Sparkline values={displaySeries(k, m)} color={colors.sleepRem} width={130} height={34} />
                    </View>
                  ) : (
                    <Text style={[styles.tileSub, { marginTop: 8 }]}>{m.latest.source === "computed" ? "From weight and height" : `1 reading · ${m.latest.source.replace("apple:", "")}`}</Text>
                  )}
                </>
              ) : (
                <Text style={styles.empty}>From your scale via Apple Health</Text>
              )}
            </Surface>
          );
        })}
      </View>
      <SectionLabel title="Biological age" />
      <BioAgeCard />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  half: { width: "48.5%" },
  tileTitle: { ...font.overline, fontSize: 11, color: colors.textMuted },
  tileValue: { ...font.number, fontSize: 28, color: colors.text, marginTop: 6 },
  tileUnit: { fontSize: 13, color: colors.textMuted, fontFamily: fonts.label },
  tileSub: { ...font.caption, color: colors.textFaint },
  body: { ...font.body, color: colors.textMuted, lineHeight: 21 },
  bodyTile: { minHeight: 128, marginBottom: spacing.md },
  bio: { gap: 6, marginBottom: spacing.md },
  bioTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  bioValue: { ...font.number, fontSize: 40, color: colors.text },
  bioDelta: { fontFamily: fonts.numeral, fontSize: 20 },
  contrib: { flexDirection: "row", alignItems: "center", gap: 8 },
  contribLabel: { ...font.caption, color: colors.textMuted, width: 112 },
  contribTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  contribMid: { position: "absolute", left: "50%", top: -2, width: 1, height: 10, backgroundColor: "rgba(255,255,255,0.18)" },
  contribBar: { position: "absolute", top: 0, height: 6, borderRadius: 3 },
  contribVal: { fontFamily: fonts.numeral, fontSize: 13, width: 36, textAlign: "right" },
  empty: { ...font.caption, color: colors.textFaint, marginTop: 10, lineHeight: 17 },
});
