import { useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { DatePickerSheet } from "@/components/Sheet";
import { Aurora } from "@/components/Aurora";
import { Surface } from "@/components/Surface";
import { HeartIcon, LeafIcon, PulseIcon } from "@/components/icons";
import { SectionLabel } from "@/components/SectionLabel";
import { MetricCard } from "@/components/MetricCard";
import { Dial } from "@/components/Dial";
import { Panel } from "@/components/Tiles";
import { insightFor } from "@/lib/insight";
import { todayIso, useDays } from "@/lib/useDays";
import { bandColor, colors, font, spacing } from "@/theme/tokens";

interface RecoveryComps {
  band?: "green" | "amber" | "red";
  hrv_ms?: number;
  hrv_base_ms?: number;
  rhr?: number;
  rhr_base?: number;
  z?: Record<string, number | null>;
}


export default function RecoveryScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const [date, setDate] = useState(params.date ?? todayIso());
  const [picking, setPicking] = useState(false);
  const q = useDays(28, date);
  const today = q.days[q.days.length - 1];
  const rec = today?.scores.recovery;
  const comps = (rec?.components ?? {}) as RecoveryComps;
  const insight = insightFor(today);
  const title = new Date(`${today?.date ?? todayIso()}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  const hrvSeries = q.days.map((d) => ((d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null));

  return (
    <View style={styles.screen}>
      <Backdrop glow={comps.band ?? "home"} height={600} />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <View style={styles.hero}>
          <Aurora variant={comps.band === "red" ? "red" : comps.band === "amber" ? "amber" : "mint"} />
          <DetailHeader title="Recovery" subtitle={title} dropdown onSubtitlePress={() => setPicking(true)} />
          <View style={{ alignItems: "center" }}>
            <Dial progress={rec ? rec.value / 100 : null} value={rec ? `${Math.round(rec.value)}%` : "–"} caption="Recovered" color={bandColor(comps.band)} size={210} stroke={12} />
          </View>
        </View>
        <View style={styles.body}>
          <View style={styles.row}>
            <Surface style={styles.tile}>
              <View style={styles.tileHead}><PulseIcon size={13} color={colors.textMuted} /><Text style={styles.over}>Resting HRV</Text></View>
              <Text style={styles.big}>{comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"} <Text style={styles.label}>ms</Text></Text>
              <Text style={[styles.delta, { color: (comps.hrv_ms ?? 0) >= (comps.hrv_base_ms ?? 0) ? colors.recovery : colors.cardio }]}>{comps.hrv_base_ms != null ? `usual ${comps.hrv_base_ms.toFixed(0)} ms` : ""}</Text>
            </Surface>
            <Surface style={styles.tile}>
              <View style={styles.tileHead}><HeartIcon size={13} color={colors.textMuted} /><Text style={styles.over}>Resting HR</Text></View>
              <Text style={styles.big}>{comps.rhr ?? "–"} <Text style={styles.label}>bpm</Text></Text>
              <Text style={[styles.delta, { color: (comps.rhr ?? 0) <= (comps.rhr_base ?? 0) ? colors.recovery : colors.strain }]}>{comps.rhr_base != null ? `usual ${comps.rhr_base.toFixed(0)} bpm` : ""}</Text>
            </Surface>
          </View>
          {insight ? (
            <Panel>
              <View style={styles.tileHead}><LeafIcon size={15} color={bandColor(comps.band)} /><Text style={styles.insightTitle}>{insight.title}</Text></View>
              <Text style={styles.insightBody}>{insight.body}</Text>
            </Panel>
          ) : null}
          {comps.z ? <SectionLabel title="How this was computed" /> : null}
          {comps.z ? <Panel>
            {Object.entries(comps.z ?? {}).map(([k, v]) => (
              <View key={k} style={styles.zRow}>
                <Text style={styles.label}>{({ hrv: "HRV vs 28-day baseline", rhr: "Resting HR vs baseline", sleep: "Sleep score", sleep_hr: "Sleep HR vs baseline", strain: "Yesterday's strain" } as Record<string, string>)[k] ?? k}</Text>
                <Text style={[styles.zVal, { color: v == null ? colors.textFaint : v >= 0 ? colors.recovery : colors.strain }]}>{v == null ? "n/a" : `${v >= 0 ? "+" : ""}${v.toFixed(2)} σ`}</Text>
              </View>
            ))}
          </Panel> : null}
          <SectionLabel title="Trends" note="last 28 days" />
          <MetricCard icon={LeafIcon} title="Recovery" value={rec ? String(Math.round(rec.value)) : "–"} unit="%" series={q.days.map((d) => d.scores.recovery?.value ?? null)} band={{ low: 34, high: 67 }} color={colors.recovery} />
          <MetricCard icon={PulseIcon} title="Resting HRV" value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"} unit="ms" series={hrvSeries} band={comps.hrv_base_ms ? { low: comps.hrv_base_ms * 0.85, high: comps.hrv_base_ms * 1.15 } : null} color={colors.recovery} />
          <MetricCard icon={HeartIcon} title="Resting HR" value={comps.rhr != null ? String(comps.rhr) : "–"} unit="bpm" series={q.days.map((d) => d.daily.rhr)} band={comps.rhr_base ? { low: comps.rhr_base - 3, high: comps.rhr_base + 3 } : null} color={colors.cardio} />
        </View>
      </ScrollView>
      <DatePickerSheet key={date} visible={picking} onClose={() => setPicking(false)} value={date} max={todayIso()} onChange={setDate} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  hero: { paddingBottom: spacing.xl, overflow: "hidden" },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  row: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  tile: { flex: 1 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { ...font.label, color: colors.textMuted },
  over: { ...font.overline, fontSize: 11, color: colors.textMuted },
  big: { ...font.number, fontSize: 26, color: colors.text, marginTop: 6 },
  delta: { ...font.caption, marginTop: 2 },
  insightTitle: { ...font.heading, fontSize: 15, color: colors.text },
  insightBody: { ...font.body, color: colors.textMuted, lineHeight: 21, marginTop: 6 },
  zRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  zVal: { ...font.label, fontVariant: ["tabular-nums"] },
});
