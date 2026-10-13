import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { DetailHeader } from "@/components/DetailHeader";
import { ArrowRight, BedIcon, ClockIcon, MoonIcon, SparkleIcon } from "@/components/icons";
import { MetricCard } from "@/components/MetricCard";
import { Ring } from "@/components/Ring";
import { Panel, StatTile } from "@/components/Tiles";
import { hms } from "@/lib/format";
import { useDays } from "@/lib/useDays";
import { colors, font, radius, spacing } from "@/theme/tokens";

function clock(mins: number): string {
  const norm = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  const d = new Date(2000, 0, 1, h, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function medianMinutes(times: (string | null)[]): number | null {
  const vals = times
    .filter((t): t is string => !!t)
    .map((t) => {
      const d = new Date(t);
      return ((d.getHours() * 60 + d.getMinutes() - 720 + 1440) % 1440); // minutes since noon
    })
    .sort((a, b) => a - b);
  if (!vals.length) return null;
  return (vals[Math.floor(vals.length / 2)] + 720) % 1440;
}

function coaching(score: number | null, awakeCount: number | null, awakeS: number | null, asleepS: number | null): string {
  if (score == null) return "No sleep recorded for last night yet.";
  if (score < 65 && ((awakeCount ?? 0) >= 3 || (awakeS ?? 0) > 45 * 60)) return "You had poor sleep last night. You were awake more than usual. Make sure that your environment is dark and quiet, and try to wind down earlier tonight.";
  if (score < 65 && (asleepS ?? 0) < 6.5 * 3600) return "A short night. Protect tonight's bedtime: aim to be in bed by your target and keep screens out of the last 30 minutes.";
  if (score >= 85) return "A solid night with good continuity. Keep the same bedtime window tonight and you should wake up well recovered.";
  return "A decent night. Your usual bedtime and a dark, cool room will help you convert it into a better one tonight.";
}

export default function SleepScreen() {
  const q = useDays(28);
  const today = q.days[q.days.length - 1];
  const s = today?.sleep;
  const score = today?.scores.sleep?.value ?? null;
  const bedMed = medianMinutes(q.days.slice(-14).map((d) => d.sleep?.start ?? null));
  const wakeMed = medianMinutes(q.days.slice(-14).map((d) => d.sleep?.end ?? null));
  const needS = 8 * 3600;
  const stripe = (fn: (d: (typeof q.days)[number]) => number | null) => q.days.map(fn);
  const title = today ? new Date(`${today.date}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "";

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <LinearGradient colors={["#2A2F5E", "#161A3A", colors.sleepBg]} locations={[0, 0.55, 1]} style={styles.hero}>
          <DetailHeader title="Sleep" subtitle={`Today, ${title}`} dropdown />
          <View style={styles.heroRing}>
            <Ring progress={score != null ? score / 100 : null} value={score != null ? `${Math.round(score)}%` : "–%"} caption="Quality" color={colors.sleep} size={170} stroke={14} trackColor="rgba(255,255,255,0.08)" />
          </View>
        </LinearGradient>

        <View style={styles.body}>
          <View style={styles.row}>
            <StatTile icon={BedIcon} label="Time in Bed" value={hms(s?.in_bed_s)} bg={colors.sleepCard} />
            <StatTile icon={ClockIcon} label="Time Asleep" value={hms(s?.asleep_s)} bg={colors.sleepCard} />
          </View>

          <Panel bg={colors.sleepCard}>
            <Text style={styles.panelLabel}>Coaching</Text>
            <Text style={styles.panelBody}>{coaching(score, s?.awake_count ?? null, s?.awake_s ?? null, s?.asleep_s ?? null)}</Text>
          </Panel>

          <Pressable style={[styles.rowCard, { backgroundColor: colors.sleepCard }]}>
            <SparkleIcon size={16} color={colors.text} />
            <Text style={styles.rowCardText}>View insights</Text>
            <ArrowRight size={16} color={colors.textMuted} />
          </Pressable>

          <Panel bg={colors.sleepCard}>
            <View style={styles.row}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={styles.panelLabel}>Wind down</Text>
                <Text style={styles.bigTime}>{bedMed != null ? clock(bedMed - 30) : "–"}</Text>
              </View>
              <View style={styles.vline} />
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={styles.panelLabel}>Target bedtime</Text>
                <Text style={styles.bigTime}>{bedMed != null ? clock(bedMed) : "–"}</Text>
              </View>
            </View>
            <View style={[styles.rowCard, styles.inner]}>
              <Text style={styles.rowCardText}>Wake up at <Text style={{ color: colors.text }}>{wakeMed != null ? clock(wakeMed) : "–"}</Text></Text>
              <ArrowRight size={16} color={colors.textMuted} />
            </View>
            <View style={[styles.rowCard, styles.inner]}>
              <Text style={styles.rowCardText}>Tonight&apos;s sleep needed</Text>
              <Text style={[styles.rowCardText, { color: colors.text }]}>{hms(needS)}</Text>
            </View>
          </Panel>

          <Text style={styles.section}>Sleep Timeline</Text>
          <Text style={styles.sectionSub}>{s ? "1 event" : "0 events"}</Text>
          {s ? (
            <Pressable onPress={() => router.push("/sleep/night")} style={[styles.rowCard, { backgroundColor: colors.sleepCard, paddingVertical: 14 }]}>
              <View style={styles.moonWrap}><MoonIcon size={18} color={colors.sleep} /></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.caption}>{s.end ? new Date(s.end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "–"}</Text>
                <Text style={styles.rowTitle}>Primary sleep</Text>
                <Text style={styles.caption}>◑ {score != null ? `${Math.round(score)}%` : "–"}   🛏 {hms(s.asleep_s)}</Text>
              </View>
              <ArrowRight size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}

          <Text style={[styles.section, { marginTop: spacing.lg }]}>Trends</Text>
          <MetricCard icon={MoonIcon} title="Sleep Score" value={score != null ? String(Math.round(score)) : "–"} unit="%" status={score != null ? { label: score >= 65 ? "Normal range" : "Below normal", tone: score >= 65 ? "good" : "bad" } : null} series={stripe((d) => d.scores.sleep?.value ?? null)} color={colors.sleep} />
          <MetricCard icon={ClockIcon} title="Time Asleep" value={hms(s?.asleep_s)} status={s?.asleep_s != null ? { label: s.asleep_s >= 7 * 3600 ? "Normal range" : "Below normal", tone: s.asleep_s >= 7 * 3600 ? "good" : "bad" } : null} series={stripe((d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null))} band={{ low: 7, high: 9 }} color={colors.sleep} />
          <MetricCard icon={MoonIcon} title="REM sleep" value={hms(s?.rem_s)} status={s?.rem_s != null && s.asleep_s ? { label: s.rem_s / s.asleep_s >= 0.18 ? "Normal range" : "Below normal", tone: s.rem_s / s.asleep_s >= 0.18 ? "good" : "bad" } : null} series={stripe((d) => (d.sleep?.rem_s != null ? d.sleep.rem_s / 3600 : null))} color={colors.sleepRem} />
          <MetricCard icon={MoonIcon} title="Deep sleep" value={hms(s?.deep_s)} status={s?.deep_s != null && s.asleep_s ? { label: s.deep_s / s.asleep_s >= 0.13 ? "Normal range" : "Below normal", tone: s.deep_s / s.asleep_s >= 0.13 ? "good" : "bad" } : null} series={stripe((d) => (d.sleep?.deep_s != null ? d.sleep.deep_s / 3600 : null))} color={colors.sleepDeep} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sleepBg },
  hero: { paddingBottom: spacing.xl, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroRing: { alignItems: "center", marginTop: spacing.sm },
  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  row: { flexDirection: "row", gap: 10, marginBottom: spacing.md, alignItems: "center" },
  vline: { width: StyleSheet.hairlineWidth, height: 44, backgroundColor: colors.hairline },
  panelLabel: { ...font.label, color: colors.textMuted },
  panelBody: { ...font.body, color: colors.text, lineHeight: 21, marginTop: 6 },
  bigTime: { ...font.number, fontSize: 24, color: colors.text, marginTop: 4 },
  rowCard: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
  inner: { backgroundColor: colors.sleepCardRaised, marginBottom: 8, paddingVertical: 12 },
  rowCardText: { ...font.heading, fontSize: 15, color: colors.textMuted, flex: 1 },
  rowTitle: { ...font.heading, fontSize: 15, color: colors.text },
  caption: { ...font.caption, color: colors.textMuted },
  moonWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.sleep}26`, alignItems: "center", justifyContent: "center" },
  section: { ...font.heading, fontSize: 17, color: colors.text },
  sectionSub: { ...font.caption, color: colors.textMuted, marginBottom: spacing.md },
});
