import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api } from "@/lib/api";
import { shortDate } from "@/lib/scores";
import { clockDuration, distance, pace, parseClock } from "@/lib/units";
import { todayIso } from "@/lib/useDays";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const DISTANCES = [
  { k: "5K", m: 5000 },
  { k: "10K", m: 10000 },
  { k: "Half", m: 21097.5 },
  { k: "Marathon", m: 42195 },
];

function AddRace({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [dist, setDist] = useState<number>(5000);
  const [other, setOther] = useState("");
  const [time, setTime] = useState("");
  const [date, setDate] = useState(todayIso());
  const [name, setName] = useState("");
  const meters = dist > 0 ? dist : Number(other) * 1000;
  const secs = parseClock(time);
  const ok = secs != null && secs > 180 && meters >= 1500 && meters <= 42500 && /^\d{4}-\d{2}-\d{2}$/.test(date);
  const add = useMutation({
    mutationFn: () => api.addRace({ date, distance_m: meters, time_s: secs ?? 0, name: name.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries();
      setTime("");
      setName("");
      onDone();
    },
  });
  return (
    <Surface style={styles.card}>
      <View style={styles.chips}>
        {DISTANCES.map((d) => (
          <Pressable key={d.k} onPress={() => setDist(d.m)} style={[styles.chip, dist === d.m && styles.chipOn]}>
            <Text style={[styles.chipText, dist === d.m && { color: colors.text }]}>{d.k}</Text>
          </Pressable>
        ))}
        <Pressable onPress={() => setDist(0)} style={[styles.chip, dist === 0 && styles.chipOn]}>
          <Text style={[styles.chipText, dist === 0 && { color: colors.text }]}>Other</Text>
        </Pressable>
      </View>
      {dist === 0 ? (
        <View style={styles.field}>
          <Text style={styles.label}>Distance (km)</Text>
          <TextInput value={other} onChangeText={(t) => setOther(t.replace(/[^0-9.]/g, ""))} keyboardType="decimal-pad" placeholder="e.g. 15" placeholderTextColor={colors.textFaint} style={styles.input} />
        </View>
      ) : null}
      <View style={styles.field}>
        <Text style={styles.label}>Finish time</Text>
        <TextInput value={time} onChangeText={setTime} placeholder="mm:ss or h:mm:ss" placeholderTextColor={colors.textFaint} style={styles.input} autoCapitalize="none" />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Date</Text>
        <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textFaint} style={styles.input} autoCapitalize="none" />
      </View>
      <View style={styles.field}>
        <Text style={styles.label}>Name</Text>
        <TextInput value={name} onChangeText={setName} placeholder="optional" placeholderTextColor={colors.textFaint} style={styles.input} />
      </View>
      {secs != null && meters > 0 ? <Text style={styles.text}>{pace(secs / (meters / 1000))} average</Text> : null}
      <Pressable style={[styles.btn, (!ok || add.isPending) && { opacity: 0.4 }]} disabled={!ok || add.isPending} onPress={() => add.mutate()}>
        <Text style={styles.btnText}>{add.isPending ? "Saving…" : "Save race"}</Text>
      </Pressable>
      {add.isError ? <Text style={[styles.text, { color: colors.recoveryRed }]}>Could not save: {String(add.error)}</Text> : null}
    </Surface>
  );
}

export default function RacesScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["races"], queryFn: api.races });
  const [adding, setAdding] = useState(false);
  const del = useMutation({ mutationFn: (id: number) => api.deleteRace(id), onSuccess: () => qc.invalidateQueries() });
  const races = q.data ?? [];

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <DetailHeader title="Races" subtitle="Results calibrate VO₂max and predictions" />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.text}>Cannot reach the backend ({String(q.error)})</Text> : null}
          {adding || !races.length ? (
            <>
              <SectionLabel title="Add a result" />
              <AddRace onDone={() => setAdding(false)} />
            </>
          ) : (
            <Pressable style={[styles.btn, { marginBottom: spacing.md }]} onPress={() => setAdding(true)}>
              <Text style={styles.btnText}>Add a race result</Text>
            </Pressable>
          )}

          {races.length ? <SectionLabel title="Your results" /> : null}
          {races.map((r) => {
            const diff = r.predicted_s != null ? r.time_s - r.predicted_s : null;
            return (
              <Surface key={r.id} style={styles.card}>
                <View style={styles.raceHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.raceName}>{r.name ?? distance(r.distance_m)}</Text>
                    <Text style={styles.method}>{shortDate(r.date)} · {distance(r.distance_m)} · {pace(r.time_s / (r.distance_m / 1000))}</Text>
                  </View>
                  <Text style={styles.time}>{clockDuration(r.time_s)}</Text>
                </View>
                <View style={styles.raceStats}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.statLabel}>VDOT</Text>
                    <Text style={styles.statVal}>{r.vdot.toFixed(1)}</Text>
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.statLabel}>WE PREDICTED</Text>
                    <Text style={styles.statVal}>
                      {r.predicted_s != null ? clockDuration(r.predicted_s) : "–"}
                      {diff != null ? <Text style={[styles.diff, { color: diff <= 0 ? colors.recovery : colors.recoveryAmber }]}>  {diff <= 0 ? "−" : "+"}{clockDuration(Math.abs(diff))}</Text> : null}
                    </Text>
                  </View>
                  <Pressable onPress={() => del.mutate(r.id)} hitSlop={8}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                </View>
              </Surface>
            );
          })}

          <Text style={styles.footer}>
            Results from the last 6 months join the VO₂max blend as Daniels VDOT, weighted toward recent races, and set the running-economy factor that turns VO₂max into race predictions. “We predicted” is our forecast from the day before.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  card: { marginBottom: spacing.md, gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.05)" },
  chipOn: { backgroundColor: "rgba(255,255,255,0.14)" },
  chipText: { ...font.overline, fontSize: 11, color: colors.textMuted },
  field: { flexDirection: "row", alignItems: "center", gap: 12 },
  label: { ...font.heading, fontSize: 15, color: colors.text, flex: 1 },
  input: { width: 150, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: "rgba(0,0,0,0.25)", color: colors.text, textAlign: "center", fontFamily: fonts.numeral, fontSize: 16 },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  btn: { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  btnText: { ...font.heading, fontSize: 14, color: colors.text },
  raceHead: { flexDirection: "row", alignItems: "center" },
  raceName: { ...font.heading, fontSize: 16, color: colors.text },
  method: { ...font.caption, color: colors.textFaint },
  time: { fontFamily: fonts.numeral, fontSize: 26, color: colors.text },
  raceStats: { flexDirection: "row", alignItems: "flex-end" },
  statLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  statVal: { fontFamily: fonts.numeral, fontSize: 18, color: colors.text },
  diff: { fontSize: 14 },
  remove: { ...font.caption, color: colors.textMuted },
  footer: { ...font.caption, color: colors.textFaint, textAlign: "center", lineHeight: 17, marginTop: spacing.sm },
});
