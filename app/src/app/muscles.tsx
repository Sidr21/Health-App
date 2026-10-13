import { useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { BodyMap } from "@/components/BodyMap";
import { DetailHeader } from "@/components/DetailHeader";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { SectionLabel } from "@/components/SectionLabel";
import { MuscleRow } from "@/components/StrengthWidgets";
import { Surface } from "@/components/Surface";
import type { MuscleStateOut, MuscleStatus } from "@/lib/api";
import { addDays, longDayLabel } from "@/lib/dates";
import { fillsFor, statusColor, statusLabel, useStrength, type MapMode } from "@/lib/strength";
import { todayIso } from "@/lib/useDays";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const MODES: { id: MapMode; label: string }[] = [
  { id: "freshness", label: "Freshness" },
  { id: "load", label: "Load" },
  { id: "volume", label: "Volume" },
];

const NOTE: Record<MapMode, string> = {
  freshness: "How recovered each muscle is now. Lifting and cardio both count; fatigue fades over 2–3 days.",
  load: "Set-equivalents over the last 7 days. One hard set as the main mover = 1; cardio is converted from training load.",
  volume: "Reps × weight credited to each muscle over the last 7 days. Bodyweight sets count as sets only.",
};

type Filter = "all" | MuscleStatus;

export default function MusclesScreen() {
  const params = useLocalSearchParams<{ mode?: MapMode }>();
  const [mode, setMode] = useState<MapMode>(params.mode ?? "freshness");
  const [filter, setFilter] = useState<Filter>("all");
  const [date, setDate] = useState(todayIso());
  const [asc, setAsc] = useState(true);
  const q = useStrength(date);
  const muscles = useMemo(() => q.data?.muscles ?? [], [q.data]);
  const fills = fillsFor(muscles, mode);
  const isToday = date >= todayIso();

  const metric = (m: MuscleStateOut) => (mode === "freshness" ? m.freshness : mode === "load" ? m.load_7d : m.volume_7d_kg || m.sets_7d);
  const max = Math.max(0, ...muscles.map(metric));
  const list = muscles
    .filter((m) => mode !== "freshness" || filter === "all" || m.status === filter)
    .sort((a, b) => {
      // freshness: most tired first; load/volume: most worked first
      const d = mode === "freshness" ? metric(a) - metric(b) : metric(b) - metric(a);
      return asc ? d : -d;
    });
  const counts: Record<Filter, number> = {
    all: muscles.length,
    recovered: muscles.filter((m) => m.status === "recovered").length,
    fatigued: muscles.filter((m) => m.status === "fatigued").length,
    depleted: muscles.filter((m) => m.status === "depleted").length,
  };

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Muscle groups" mode="close" />
        <View style={styles.body}>
          <View style={styles.segment}>
            {MODES.map((m) => (
              <Pressable key={m.id} onPress={() => setMode(m.id)} style={[styles.segItem, mode === m.id && styles.segOn]}>
                <Text style={[styles.segText, mode === m.id && { color: colors.text }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>

          <Surface style={styles.mapCard} radiusSize={radius.lg}>
            <View style={styles.maps}>
              <View style={styles.mapCol}>
                <BodyMap side="front" fills={fills} width={140} />
                <Text style={styles.mapLabel}>Front</Text>
              </View>
              <View style={styles.mapCol}>
                <BodyMap side="back" fills={fills} width={140} />
                <Text style={styles.mapLabel}>Back</Text>
              </View>
            </View>
            {mode === "freshness" ? (
              <View style={styles.chips}>
                {(["all", "recovered", "fatigued", "depleted"] as Filter[]).map((f) => (
                  <Pressable key={f} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipOn]}>
                    {f !== "all" ? <View style={[styles.dot, { backgroundColor: statusColor[f] }]} /> : null}
                    <Text style={[styles.chipText, filter === f && { color: colors.text }]}>
                      {f === "all" ? "All" : statusLabel[f]} <Text style={styles.chipCount}>{counts[f]}</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.scale}>
                <Text style={styles.scaleText}>Less</Text>
                {[0.25, 0.45, 0.65, 0.85, 1].map((o) => (
                  <View key={o} style={[styles.scaleBox, { backgroundColor: mode === "load" ? colors.strain : colors.muscular, opacity: o }]} />
                ))}
                <Text style={styles.scaleText}>More</Text>
              </View>
            )}
            <Text style={styles.note}>{NOTE[mode]}</Text>
          </Surface>

          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => setDate(addDays(date, -1))}>
              <ChevronLeft size={18} color={colors.text} />
            </Pressable>
            <View style={styles.stepDate}>
              <Text style={styles.stepText}>{isToday ? `Today, ${longDayLabel(date).split(", ").slice(1).join(", ")}` : longDayLabel(date)}</Text>
            </View>
            <Pressable style={[styles.stepBtn, isToday && { opacity: 0.35 }]} disabled={isToday} onPress={() => setDate(addDays(date, 1))}>
              <ChevronRight size={18} color={colors.text} />
            </Pressable>
          </View>

          <SectionLabel
            title={mode === "freshness" ? "All muscles" : mode === "load" ? "Load by muscle" : "Volume by muscle"}
            note={q.isLoading ? "loading" : undefined}
            action={
              <Pressable onPress={() => setAsc(!asc)} hitSlop={8}>
                <Text style={styles.sort}>{asc ? (mode === "freshness" ? "Most tired first" : "Most worked first") : "Reversed"} ⇅</Text>
              </Pressable>
            }
          />
          {q.isError ? <Text style={styles.note}>Cannot reach the backend ({String(q.error)})</Text> : null}
          {list.map((m) => (
            <MuscleRow key={m.id} m={m} mode={mode} max={max} />
          ))}
          {q.data ? (
            <Text style={styles.footer}>
              {q.data.method.inputs.sets} sets and {q.data.method.inputs.activities} cardio workouts in the last 5 weeks
              {q.data.method.inputs.duplicates_dropped ? ` · ${q.data.method.inputs.duplicates_dropped} duplicate watch recording skipped` : ""}.
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.pill, padding: 4, marginBottom: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  segItem: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.pill },
  segOn: { backgroundColor: "rgba(255,255,255,0.10)" },
  segText: { ...font.overline, fontSize: 12, color: colors.textMuted },
  mapCard: { marginBottom: spacing.md, paddingVertical: spacing.lg },
  maps: { flexDirection: "row", justifyContent: "space-around" },
  mapCol: { alignItems: "center", gap: 6 },
  mapLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", marginTop: spacing.md },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.05)" },
  chipOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { ...font.label, color: colors.textMuted },
  chipCount: { fontFamily: fonts.numeral, color: colors.textFaint },
  scale: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, marginTop: spacing.md },
  scaleBox: { width: 18, height: 10, borderRadius: 3 },
  scaleText: { ...font.caption, color: colors.textFaint, marginHorizontal: 4 },
  note: { ...font.caption, color: colors.textFaint, textAlign: "center", marginTop: spacing.md, lineHeight: 17, paddingHorizontal: spacing.sm },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  stepDate: { flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  stepText: { ...font.label, color: colors.text },
  sort: { ...font.caption, color: colors.textMuted },
  footer: { ...font.caption, color: colors.textFaint, marginTop: spacing.sm, lineHeight: 17 },
});
