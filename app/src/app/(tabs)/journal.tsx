import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Header, RoundButton } from "@/components/Header";
import { CalendarIcon, CheckCircle, CloseIcon, DotsIcon, SparkleIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { DatePickerSheet, MenuSheet } from "@/components/Sheet";
import { Surface } from "@/components/Surface";
import { WeekStrip, type WeekDay } from "@/components/WeekStrip";
import { api } from "@/lib/api";
import { dayOfMonth, monthLabel, weekOf } from "@/lib/dates";
import { TAGS, type TagDef } from "@/lib/journal";
import { todayIso } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

type Tri = "no" | "skip" | "yes" | null;

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

function NumberField({ e, value, onCommit }: { e: TagDef; value: number | null; onCommit: (v: number | null) => void }) {
  // remounted (via key) whenever the stored value changes, so no syncing effect is needed
  const [text, setText] = useState(value == null ? "" : String(value));
  const commit = () => {
    const v = text.trim() === "" ? null : Number(text);
    if (v !== value && (v == null || isFinite(v))) onCommit(v);
  };
  return (
    <View style={styles.numRight}>
      <TextInput
        value={text}
        onChangeText={(t) => setText(t.replace(/[^0-9.]/g, ""))}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="decimal-pad"
        placeholder={e.placeholder ?? "–"}
        placeholderTextColor={colors.textFaint}
        style={styles.numInput}
      />
      {e.unit ? <Text style={styles.numUnit}>{e.unit}</Text> : null}
    </View>
  );
}

function EntryRow({ e, value, onChange }: { e: TagDef; value: number | null; onChange: (v: number | null) => void }) {
  const tri: Tri = value == null ? null : value >= 1 ? "yes" : "no";
  return (
    <Surface style={styles.entry}>
      <Text style={styles.emoji}>{e.emoji}</Text>
      <Text style={styles.entryLabel}>{e.label}</Text>
      {e.kind === "tri" ? (
        <TriToggle value={tri} onChange={(v) => onChange(v === "yes" ? 1 : v === "no" ? 0 : null)} />
      ) : (
        <NumberField key={String(value)} e={e} value={value} onCommit={onChange} />
      )}
    </Surface>
  );
}

export default function JournalScreen() {
  const today = todayIso();
  const qc = useQueryClient();
  const [selected, setSelected] = useState(today);
  const [menu, setMenu] = useState(false);
  const [picking, setPicking] = useState(false);
  const week = weekOf(selected);
  const q = useQuery({ queryKey: ["journal", week[0], week[6]], queryFn: () => api.journal(week[0], week[6]) });
  const byDay: Record<string, Record<string, number | null>> = {};
  for (const r of q.data ?? []) (byDay[r.date] ??= {})[r.tag] = r.value;
  const values = byDay[selected] ?? {};
  const save = useMutation({
    mutationFn: async ({ tag, value }: { tag: string; value: number | null }) => {
      if (value == null) await api.deleteJournal(selected, tag);
      else await api.putJournal({ date: selected, tag, value });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
  const days: WeekDay[] = week.map((iso) => ({
    iso,
    weekday: "",
    day: dayOfMonth(iso),
    badge: Object.keys(byDay[iso] ?? {}).length ? <CheckCircle size={20} color={colors.gold} /> : null,
    dim: iso > today,
  }));
  const logged = Object.keys(values).length;
  const clearDay = useMutation({
    mutationFn: async () => {
      for (const tag of Object.keys(values)) await api.deleteJournal(selected, tag);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["journal"] });
      qc.invalidateQueries({ queryKey: ["insights"] });
    },
  });
  const dayName = new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

  return (
    <Screen refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <View style={styles.topRow}>
        <Pressable style={styles.insights} onPress={() => router.push("/journal/insights")}>
          <SparkleIcon size={16} color={colors.text} />
          <Text style={styles.insightsText}>Insights</Text>
        </Pressable>
        <RoundButton onPress={() => setMenu(true)}><DotsIcon size={20} color={colors.text} /></RoundButton>
      </View>
      <Header title="Journal" subtitle={monthLabel(selected)} />
      <View style={styles.weekHead}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => (
          <Text key={w} style={styles.weekHeadText}>{w}</Text>
        ))}
      </View>
      <View style={styles.hairline} />
      <WeekStrip days={days} selected={selected} onSelect={(iso) => iso <= today && setSelected(iso)} variant="circles" />

      <Text style={styles.section}>{selected === today ? "Today's entries" : `Entries for ${new Date(`${selected}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}`}</Text>
      <Text style={styles.sectionSub}>
        {logged ? `${logged} logged. ` : ""}Each entry is compared with the next morning&apos;s recovery, sleep, HRV and resting HR.
      </Text>

      <Text style={styles.group}>Daytime</Text>
      {TAGS.filter((t) => t.group === "day").map((e) => (
        <EntryRow key={`${selected}-${e.key}`} e={e} value={values[e.key] ?? null} onChange={(v) => save.mutate({ tag: e.key, value: v })} />
      ))}
      <Text style={styles.group}>Nighttime</Text>
      {TAGS.filter((t) => t.group === "night").map((e) => (
        <EntryRow key={`${selected}-${e.key}`} e={e} value={values[e.key] ?? null} onChange={(v) => save.mutate({ tag: e.key, value: v })} />
      ))}
      <Text style={styles.footnote}>
        {save.isError ? `Could not save: ${String(save.error)}` : q.isError ? `Cannot reach the backend (${String(q.error)})` : "Saved to your backend as you tap. ✕ = no, ✓ = yes, — clears the entry."}
      </Text>
      <MenuSheet
        visible={menu}
        onClose={() => setMenu(false)}
        items={[
          { label: "Insights", sub: "What your tags do to recovery and sleep", icon: SparkleIcon, color: colors.gold, onPress: () => router.push("/journal/insights") },
          { label: "Pick a day", sub: "Fill in an earlier day", icon: CalendarIcon, color: colors.cardio, onPress: () => setPicking(true) },
          ...(logged
            ? [{ label: `Clear ${dayName}`, sub: `Removes ${logged} entr${logged === 1 ? "y" : "ies"}`, icon: CloseIcon, color: colors.recoveryRed, onPress: () => clearDay.mutate() }]
            : []),
        ]}
      />
      <DatePickerSheet key={selected} visible={picking} onClose={() => setPicking(false)} value={selected} max={today} onChange={setSelected} title="Journal day" />
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
  entry: { flexDirection: "row", alignItems: "center", paddingVertical: 12, marginBottom: spacing.sm, gap: 10 },
  emoji: { fontSize: 20 },
  entryLabel: { ...font.heading, color: colors.text, flex: 1 },
  tri: { flexDirection: "row", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 12, padding: 2, borderWidth: 1, borderColor: "rgba(255,255,255,0.08)" },
  triBtn: { width: 40, height: 36, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  triActive: { backgroundColor: colors.cardRaised },
  triText: { ...font.heading, color: colors.textFaint },
  numRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  numInput: { width: 76, height: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.hairline, color: colors.text, textAlign: "center", fontFamily: fonts.numeral, fontSize: 17, backgroundColor: "rgba(0,0,0,0.25)" },
  numUnit: { ...font.caption, color: colors.textMuted, width: 34 },
  footnote: { ...font.caption, color: colors.textFaint, marginTop: spacing.md },
});
