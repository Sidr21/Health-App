import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { CloseIcon, PlusIcon } from "@/components/icons";
import { Surface } from "@/components/Surface";
import { api, type CommonExercise, type LogSetIn } from "@/lib/api";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

interface SetDraft {
  reps: string;
  weight: string;
}
interface ExerciseDraft {
  id: number;
  name: string;
  sets: SetDraft[];
}

const MUSCLE_NAMES: Record<string, string> = {
  chest: "Chest", shoulders: "Shoulders", biceps: "Biceps", triceps: "Triceps", forearms: "Forearms",
  abs: "Abs", obliques: "Obliques", traps: "Traps", lats: "Lats", lower_back: "Lower back",
  glutes: "Glutes", quads: "Quads", hamstrings: "Hamstrings", adductors: "Adductors", calves: "Calves",
};

let nextId = 1;
const blank = (): ExerciseDraft => ({ id: nextId++, name: "", sets: [{ reps: "", weight: "" }] });

/** Exact instant (UTC ISO) so the backend never has to guess the device's time zone. */
function startOf(day: "today" | "yesterday"): string {
  const d = new Date();
  if (day === "yesterday") {
    d.setDate(d.getDate() - 1);
    d.setHours(18, 0, 0, 0);
  }
  return d.toISOString();
}

function ExerciseBlock({
  ex,
  common,
  unit,
  onChange,
  onRemove,
}: {
  ex: ExerciseDraft;
  common: CommonExercise[];
  unit: "lb" | "kg";
  onChange: (ex: ExerciseDraft) => void;
  onRemove: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const qn = ex.name.trim().toLowerCase();
  const exact = common.find((c) => c.name.toLowerCase() === qn);
  const suggestions = focused && !exact ? common.filter((c) => !qn || c.name.toLowerCase().includes(qn)).slice(0, 6) : [];
  const muscles = exact
    ? Object.entries(exact.muscles)
        .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
        .slice(0, 3)
        .map(([m]) => MUSCLE_NAMES[m] ?? m)
    : [];
  const setAt = (i: number, patch: Partial<SetDraft>) =>
    onChange({ ...ex, sets: ex.sets.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  return (
    <Surface style={styles.block}>
      <View style={styles.blockHead}>
        <TextInput
          value={ex.name}
          onChangeText={(name) => onChange({ ...ex, name })}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder="Exercise (e.g. Bench Press)"
          placeholderTextColor={colors.textFaint}
          style={styles.exInput}
        />
        <Pressable onPress={onRemove} hitSlop={10} style={styles.iconBtn}>
          <CloseIcon size={14} color={colors.textMuted} />
        </Pressable>
      </View>
      {muscles.length ? <Text style={styles.muscles}>{muscles.join(" · ")}</Text> : null}
      {suggestions.length ? (
        <View style={styles.suggest}>
          {suggestions.map((c) => (
            <Pressable key={c.name} onPress={() => onChange({ ...ex, name: c.name })} style={styles.suggestChip}>
              <Text style={styles.suggestText}>{c.name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.setHead}>
        <Text style={[styles.colLabel, { width: 44 }]}>Set</Text>
        <Text style={[styles.colLabel, { flex: 1 }]}>Reps</Text>
        <Text style={[styles.colLabel, { flex: 1 }]}>Weight ({unit})</Text>
        <View style={{ width: 28 }} />
      </View>
      {ex.sets.map((s, i) => (
        <View key={i} style={styles.setRow}>
          <Text style={styles.setNum}>{i + 1}</Text>
          <TextInput value={s.reps} onChangeText={(reps) => setAt(i, { reps: reps.replace(/[^0-9]/g, "") })} keyboardType="number-pad" placeholder="–" placeholderTextColor={colors.textFaint} style={styles.cell} />
          <TextInput value={s.weight} onChangeText={(weight) => setAt(i, { weight: weight.replace(/[^0-9.]/g, "") })} keyboardType="decimal-pad" placeholder="body" placeholderTextColor={colors.textFaint} style={styles.cell} />
          <Pressable
            hitSlop={8}
            style={styles.iconBtn}
            disabled={ex.sets.length === 1}
            onPress={() => onChange({ ...ex, sets: ex.sets.filter((_, k) => k !== i) })}
          >
            <CloseIcon size={12} color={ex.sets.length === 1 ? "transparent" : colors.textFaint} />
          </Pressable>
        </View>
      ))}
      <Pressable
        style={styles.addSet}
        onPress={() => onChange({ ...ex, sets: [...ex.sets, { ...(ex.sets[ex.sets.length - 1] ?? { reps: "", weight: "" }) }] })}
      >
        <PlusIcon size={14} color={colors.textMuted} />
        <Text style={styles.addSetText}>Add set</Text>
      </Pressable>
    </Surface>
  );
}

export default function LogStrengthScreen() {
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: ["strength-exercises"], queryFn: api.strengthExercises, staleTime: Infinity });
  const [name, setName] = useState("");
  const [day, setDay] = useState<"today" | "yesterday">("today");
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([blank()]);

  const sets: LogSetIn[] = exercises.flatMap((e) =>
    e.name.trim()
      ? e.sets
          .filter((s) => s.reps || s.weight)
          .map((s) => ({ exercise: e.name.trim(), reps: s.reps ? Number(s.reps) : null, weight: s.weight ? Number(s.weight) : null }))
      : [],
  );
  const save = useMutation({
    mutationFn: () => api.logStrength({ started_at: startOf(day), name: name.trim() || null, unit, sets }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["strength"] });
      if (router.canGoBack()) router.back();
      else router.replace("/fitness");
    },
  });

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <DetailHeader title="Log lift" mode="close" />
        <View style={styles.body}>
          <TextInput value={name} onChangeText={setName} placeholder="Workout name (optional)" placeholderTextColor={colors.textFaint} style={styles.nameInput} />
          <View style={styles.toggles}>
            <View style={styles.segment}>
              {(["today", "yesterday"] as const).map((d) => (
                <Pressable key={d} onPress={() => setDay(d)} style={[styles.segItem, day === d && styles.segOn]}>
                  <Text style={[styles.segText, day === d && { color: colors.text }]}>{d === "today" ? "Today" : "Yesterday"}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.segment}>
              {(["lb", "kg"] as const).map((u) => (
                <Pressable key={u} onPress={() => setUnit(u)} style={[styles.segItem, unit === u && styles.segOn]}>
                  <Text style={[styles.segText, unit === u && { color: colors.text }]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {exercises.map((ex) => (
            <ExerciseBlock
              key={ex.id}
              ex={ex}
              unit={unit}
              common={catalog.data?.common ?? []}
              onChange={(next) => setExercises(exercises.map((e) => (e.id === ex.id ? next : e)))}
              onRemove={() => setExercises(exercises.length > 1 ? exercises.filter((e) => e.id !== ex.id) : [blank()])}
            />
          ))}
          <Pressable style={styles.addExercise} onPress={() => setExercises([...exercises, blank()])}>
            <PlusIcon size={16} color={colors.text} />
            <Text style={styles.addExerciseText}>Add exercise</Text>
          </Pressable>

          <Text style={styles.hint}>
            Leave weight empty for bodyweight sets. Lifting logged in Strong or Hevy can be imported instead with{" "}
            <Text style={{ fontFamily: fonts.numeral }}>health strength import export.csv</Text>.
          </Text>
          {save.isError ? <Text style={styles.error}>Could not save: {String(save.error)}</Text> : null}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          style={[styles.saveBtn, (!sets.length || save.isPending) && { opacity: 0.4 }]}
          disabled={!sets.length || save.isPending}
          onPress={() => save.mutate()}
        >
          <Text style={styles.saveText}>{save.isPending ? "Saving…" : sets.length ? `Save ${sets.length} set${sets.length > 1 ? "s" : ""}` : "Add a set to save"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const input = {
  backgroundColor: "rgba(255,255,255,0.06)",
  borderRadius: radius.sm,
  color: colors.text,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: colors.hairline,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  nameInput: { ...input, ...font.heading, paddingHorizontal: 14, paddingVertical: 12, marginBottom: spacing.md },
  toggles: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  segment: { flex: 1, flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.pill, padding: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  segItem: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.pill },
  segOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  segText: { ...font.overline, fontSize: 12, color: colors.textMuted },
  block: { marginBottom: spacing.md },
  blockHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  exInput: { ...input, flex: 1, flexBasis: 0, minWidth: 0, ...font.heading, fontSize: 16, paddingHorizontal: 12, paddingVertical: 10 },
  iconBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  muscles: { ...font.overline, fontSize: 10, color: colors.muscular, marginTop: 8 },
  suggest: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  suggestChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.07)" },
  suggestText: { ...font.label, color: colors.text },
  setHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 14, marginBottom: 6 },
  colLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  setNum: { width: 44, fontFamily: fonts.numeral, fontSize: 16, color: colors.textMuted },
  cell: { ...input, flex: 1, flexBasis: 0, minWidth: 0, fontFamily: fonts.numeral, fontSize: 18, paddingHorizontal: 12, paddingVertical: 8, textAlign: "center" },
  addSet: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 6, paddingVertical: 6 },
  addSetText: { ...font.label, color: colors.textMuted },
  addExercise: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: colors.hairline, marginBottom: spacing.lg },
  addExerciseText: { ...font.heading, fontSize: 15, color: colors.text },
  hint: { ...font.caption, color: colors.textFaint, lineHeight: 17 },
  error: { ...font.caption, color: colors.recoveryRed, marginTop: spacing.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: 28, backgroundColor: "rgba(10,12,17,0.92)" },
  saveBtn: { backgroundColor: colors.recovery, borderRadius: radius.pill, paddingVertical: 15, alignItems: "center" },
  saveText: { ...font.heading, color: "#0A2A1E" },
});
