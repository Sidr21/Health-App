import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Header, RoundButton } from "@/components/Header";
import { ArrowRight, CheckCircle, DotsIcon, SparkleIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { WeekStrip, type WeekDay } from "@/components/WeekStrip";
import { dayOfMonth, monthLabel, weekOf } from "@/lib/dates";
import { todayIso } from "@/lib/useDays";
import { colors, font, radius, spacing } from "@/theme/tokens";

type Tri = "no" | "skip" | "yes" | null;

interface Entry {
  key: string;
  emoji: string;
  label: string;
  kind: "tri" | "number";
  unit?: string;
}

const DAYTIME: Entry[] = [
  { key: "sugar", emoji: "🍬", label: "Added sugar", kind: "tri" },
  { key: "caffeine", emoji: "☕", label: "Caffeine", kind: "number", unit: "mg" },
  { key: "mood", emoji: "😊", label: "Daily mood", kind: "number" },
  { key: "hydration", emoji: "💧", label: "Hydration", kind: "number", unit: "fl oz" },
];
const NIGHTTIME: Entry[] = [
  { key: "alcohol", emoji: "🍷", label: "Alcohol", kind: "tri" },
  { key: "late_meal", emoji: "🍽️", label: "Late meal", kind: "tri" },
  { key: "screens", emoji: "📱", label: "Screens in bed", kind: "tri" },
];

function TriToggle({ value, onChange }: { value: Tri; onChange: (v: Tri) => void }) {
  const opts: { v: Tri; glyph: string }[] = [
    { v: "no", glyph: "✕" },
    { v: "skip", glyph: "—" },
    { v: "yes", glyph: "✓" },
  ];
  return (
    <View style={styles.tri}>
      {opts.map((o) => (
        <Pressable key={o.v} onPress={() => onChange(value === o.v ? null : o.v)} style={[styles.triBtn, value === o.v && styles.triActive]}>
          <Text style={[styles.triText, value === o.v && { color: colors.text }]}>{o.glyph}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EntryRow({ e, value, onChange }: { e: Entry; value: Tri | number | null; onChange: (v: Tri) => void }) {
  return (
    <View style={styles.entry}>
      <Text style={styles.emoji}>{e.emoji}</Text>
      <Text style={styles.entryLabel}>{e.label}</Text>
      {e.kind === "tri" ? (
        <TriToggle value={(value as Tri) ?? null} onChange={onChange} />
      ) : (
        <View style={styles.numRight}>
          <Text style={styles.numValue}>{value == null ? "–" : String(value)}{e.unit ? ` ${e.unit}` : ""}</Text>
          <View style={styles.arrowBtn}><ArrowRight size={16} color={colors.textMuted} /></View>
        </View>
      )}
    </View>
  );
}

export default function JournalScreen() {
  const today = todayIso();
  const [selected, setSelected] = useState(today);
  // Keyed by date then entry; device-local until the journal API lands (phase 5).
  const [entries, setEntries] = useState<Record<string, Record<string, Tri | number | null>>>({});
  const values = entries[selected] ?? {};
  const setValues = (fn: (s: Record<string, Tri | number | null>) => Record<string, Tri | number | null>) =>
    setEntries((all) => ({ ...all, [selected]: fn(all[selected] ?? {}) }));
  const week = weekOf(selected);
  const hasEntries = (iso: string) => Object.values(entries[iso] ?? {}).some((v) => v != null);
  const days: WeekDay[] = week.map((iso) => ({
    iso,
    weekday: "",
    day: dayOfMonth(iso),
    badge: hasEntries(iso) ? <CheckCircle size={20} color={colors.gold} /> : null,
    dim: iso > today,
  }));

  return (
    <Screen>
      <View style={styles.topRow}>
        <Pressable style={styles.insights}>
          <SparkleIcon size={16} color={colors.text} />
          <Text style={styles.insightsText}>Insights</Text>
        </Pressable>
        <RoundButton><DotsIcon size={20} color={colors.text} /></RoundButton>
      </View>
      <Header title="Journal" subtitle={monthLabel(selected)} />
      <View style={styles.weekHead}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <Text key={w} style={styles.weekHeadText}>{w}</Text>
        ))}
      </View>
      <View style={styles.hairline} />
      <WeekStrip days={days} selected={selected} onSelect={setSelected} variant="circles" />

      <Text style={styles.section}>{selected === today ? "Today's Entries" : `Entries for ${selected}`}</Text>
      <Text style={styles.sectionSub}>Your entries today will contribute to the 90-day rolling data for tomorrow&apos;s insights.</Text>

      <Text style={styles.group}>Daytime</Text>
      {DAYTIME.map((e) => (
        <EntryRow key={e.key} e={e} value={values[e.key] ?? null} onChange={(v) => setValues((s) => ({ ...s, [e.key]: v }))} />
      ))}
      <Text style={styles.group}>Nighttime</Text>
      {NIGHTTIME.map((e) => (
        <EntryRow key={e.key} e={e} value={values[e.key] ?? null} onChange={(v) => setValues((s) => ({ ...s, [e.key]: v }))} />
      ))}
      <Text style={styles.footnote}>Entries are kept on this device until the journal API lands (phase 5).</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: spacing.lg },
  insights: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.hairline, borderRadius: 999, paddingHorizontal: 16, height: 44 },
  insightsText: { ...font.heading, fontSize: 15, color: colors.text },
  weekHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  weekHeadText: { ...font.label, color: colors.textFaint, flex: 1, textAlign: "center" },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginHorizontal: -16 },
  section: { ...font.heading, fontSize: 20, color: colors.text, marginTop: spacing.xl },
  sectionSub: { ...font.body, color: colors.textMuted, marginTop: 4, marginBottom: spacing.lg, lineHeight: 21 },
  group: { ...font.heading, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.sm },
  entry: { flexDirection: "row", alignItems: "center", backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.lg, marginBottom: spacing.sm, gap: 10 },
  emoji: { fontSize: 20 },
  entryLabel: { ...font.heading, color: colors.text, flex: 1 },
  tri: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: 12, padding: 2, borderWidth: 1, borderColor: colors.hairline },
  triBtn: { width: 40, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  triActive: { backgroundColor: colors.cardRaised },
  triText: { ...font.heading, color: colors.textFaint },
  numRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  numValue: { ...font.body, color: colors.textMuted },
  arrowBtn: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center" },
  footnote: { ...font.caption, color: colors.textFaint, marginTop: spacing.md },
});
