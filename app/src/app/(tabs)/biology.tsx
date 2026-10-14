import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { VitalKey } from "@/lib/vitals";
import { ContributionBars } from "@/components/BioAge";
import { Card } from "@/components/Card";
import { Header, RoundButton } from "@/components/Header";
import { ChevronRight, DocIcon, DotsIcon, FlaskIcon, HeartIcon, LeafIcon, PulseIcon, SparkleIcon } from "@/components/icons";
import { RangeBar } from "@/components/RangeBar";
import { Screen } from "@/components/Screen";
import { MenuSheet } from "@/components/Sheet";
import { SectionLabel } from "@/components/SectionLabel";
import { Sparkline } from "@/components/Sparkline";
import { Surface } from "@/components/Surface";
import { api } from "@/lib/api";
import { bmiCategory, bodyDelta, bodyValue, displaySeries, type BodyKey } from "@/lib/body";
import { hms } from "@/lib/format";
import { flagColor, flagLabel, shown } from "@/lib/labs";
import { useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

function Tile({ title, value, unit, series, color, sub, metric }: { title: string; value: string; unit?: string; series: (number | null)[]; color: string; sub?: string; metric: VitalKey }) {
  return (
    <Card style={styles.half} onPress={() => router.push({ pathname: "/vital/[metric]", params: { metric } })}>
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
  return (
    <Surface style={styles.bio} onPress={() => router.push("/bioage")}>
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
      <View style={{ marginTop: 6 }}>
        <ContributionBars contributions={b.contributions ?? {}} />
      </View>
      <Text style={[styles.tileSub, { marginTop: 4, lineHeight: 16 }]}>
        Years each input adds or removes. Fitness weighs 45%; inputs without data are left out rather than guessed.
      </Text>
    </Surface>
  );
}

function LabsCard() {
  const labs = useQuery({ queryKey: ["labs"], queryFn: api.labs });
  const docs = useQuery({ queryKey: ["documents"], queryFn: api.documents });
  const markers = labs.data?.markers ?? [];
  const toReview = (docs.data ?? []).filter((d) => d.status === "review").length;
  const flagged = markers.filter((m) => flagLabel(m.flag));
  const newest = markers.reduce<string | null>((a, m) => (m.date && (!a || m.date > a) ? m.date : a), null);
  if (!markers.length) {
    return (
      <Surface style={styles.labs} onPress={() => router.push("/labs")}>
        <View style={styles.labsHead}>
          <FlaskIcon size={18} color={colors.recovery} />
          <Text style={[styles.tileTitle, { flex: 1 }]}>{toReview ? `${toReview} document${toReview > 1 ? "s" : ""} to review` : "Add your blood work"}</Text>
          <ChevronRight size={14} color={colors.textFaint} />
        </View>
        <Text style={styles.tileSub}>A PDF or photos of a lab report or doctor&apos;s note. Results are read for you, checked by you, and charted across reports.</Text>
      </Surface>
    );
  }
  return (
    <Surface style={styles.labs} onPress={() => router.push("/labs")}>
      <View style={styles.labsHead}>
        <Text style={[styles.tileTitle, { flex: 1 }]}>
          {markers.length} markers{newest ? ` · latest ${new Date(`${newest}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}` : ""}
        </Text>
        {toReview ? <Text style={[styles.tileSub, { color: colors.recoveryAmber }]}>{toReview} to review</Text> : null}
        <ChevronRight size={14} color={colors.textFaint} />
      </View>
      {flagged.length ? (
        flagged.slice(0, 4).map((m) => {
          const v = shown(m);
          return (
            <View key={m.analyte} style={styles.labRow}>
              <Text style={[styles.tileSub, { flex: 1, color: colors.text }]} numberOfLines={1}>{m.label}</Text>
              <RangeBar value={v.num} lo={v.lo} hi={v.hi} color={flagColor(m.flag)} width={64} />
              <Text style={[styles.labVal, { color: flagColor(m.flag) }]}>{v.value}<Text style={styles.tileSub}> {v.unit}</Text></Text>
            </View>
          );
        })
      ) : (
        <Text style={styles.tileSub}>Every marker in range on its latest result.</Text>
      )}
      {flagged.length > 4 ? <Text style={styles.tileSub}>and {flagged.length - 4} more out of range</Text> : null}
    </Surface>
  );
}

export default function BiologyScreen() {
  const [menu, setMenu] = useState(false);
  const q = useDays(28);
  const latest = q.days[q.days.length - 1];
  const comps = (latest?.scores.recovery?.components ?? {}) as { hrv_ms?: number };
  const body = useQuery({ queryKey: ["body"], queryFn: () => api.bodySummary(365) });
  return (
    <Screen refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <Header centered title="Biology" left={<View style={{ width: 44 }} />} right={<RoundButton onPress={() => setMenu(true)}><DotsIcon size={20} color={colors.text} /></RoundButton>} />
      <SectionLabel title="Vitals" note="last 28 days" />
      <View style={styles.grid}>
        <Tile metric="hrv" title="Resting HRV" value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"} unit="ms" series={q.days.map((d) => ((d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null))} color={colors.recovery} />
        <Tile metric="rhr" title="Resting HR" value={latest?.daily.rhr != null ? String(latest.daily.rhr) : "–"} unit="bpm" series={q.days.map((d) => d.daily.rhr)} color={colors.cardio} />
        <Tile metric="sleep_hr" title="Sleep HR" value={latest?.sleep?.hr_avg != null ? String(latest.sleep.hr_avg) : "–"} unit="bpm" series={q.days.map((d) => d.sleep?.hr_avg ?? null)} color={colors.sleep} />
        <Tile metric="stress" title="Stress" value={latest?.daily.stress_avg != null ? String(latest.daily.stress_avg) : "–"} series={q.days.map((d) => d.daily.stress_avg)} color={colors.stress} sub="daily average" />
        <Tile metric="asleep" title="Time asleep" value={hms(latest?.sleep?.asleep_s)} series={q.days.map((d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null))} color={colors.sleepDeep} />
        <Tile metric="steps" title="Steps" value={latest?.daily.steps != null ? latest.daily.steps.toLocaleString() : "–"} series={q.days.map((d) => d.daily.steps)} color={colors.energy} />
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
      <SectionLabel title="Labs" />
      <LabsCard />
      <SectionLabel title="Biological age" />
      <BioAgeCard />
      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: "Biological age", sub: "What sets it, week by week", icon: SparkleIcon, color: colors.recovery, onPress: () => router.push("/bioage") },
          { label: "HRV trend", icon: PulseIcon, color: colors.recovery, onPress: () => router.push({ pathname: "/vital/[metric]", params: { metric: "hrv" } }) },
          { label: "Resting HR trend", icon: HeartIcon, color: colors.cardio, onPress: () => router.push({ pathname: "/vital/[metric]", params: { metric: "rhr" } }) },
          { label: "Weight", icon: LeafIcon, color: colors.sleepRem, onPress: () => router.push({ pathname: "/body/[metric]", params: { metric: "weight_kg" } }) },
          { label: "Labs", sub: "Blood work and doctor's documents", icon: FlaskIcon, color: colors.recovery, onPress: () => router.push("/labs") },
          { label: "Add a lab report", sub: "PDF or photos", icon: DocIcon, color: colors.recovery, onPress: () => router.push({ pathname: "/labs", params: { upload: "1" } }) },
          { label: "Connections", sub: "Apple Health, COROS", icon: LeafIcon, color: colors.textMuted, onPress: () => router.push("/connections") },
        ]}
      />
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
  labs: { gap: 10, marginBottom: spacing.md },
  labsHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  labRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  labVal: { fontFamily: fonts.numeral, fontSize: 17, minWidth: 70, textAlign: "right" },
  bioTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  bioValue: { ...font.number, fontSize: 40, color: colors.text },
  bioDelta: { fontFamily: fonts.numeral, fontSize: 20 },
  empty: { ...font.caption, color: colors.textFaint, marginTop: 10, lineHeight: 17 },
});
