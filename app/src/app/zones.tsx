import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ZONE_COLORS } from "@/components/Charts";
import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api, type SettingsIn, type SettingsOut } from "@/lib/api";
import { pace } from "@/lib/units";
import { LTHR_SOURCE } from "@/lib/zones";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const HR_MAX_METHOD: Record<string, string> = {
  age_formula: "age formula",
  observed: "highest HR recorded",
  user: "set by you",
  field_test: "field test",
};

function LthrSetter({ setValue, onSave, onClear }: { setValue: number | null; onSave: (v: number) => void; onClear: () => void }) {
  const [text, setText] = useState(setValue ? String(setValue) : "");
  const ok = Number(text) >= 100 && Number(text) <= 220;
  return (
    <View style={styles.setter}>
      <TextInput
        value={text}
        onChangeText={(t) => setText(t.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        placeholder="bpm"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
      />
      <Pressable style={[styles.btn, !ok && { opacity: 0.4 }]} disabled={!ok} onPress={() => onSave(Number(text))}>
        <Text style={styles.btnText}>Set threshold HR</Text>
      </Pressable>
      {setValue ? (
        <Pressable style={styles.btnGhost} onPress={onClear}>
          <Text style={styles.btnGhostText}>Use ours</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function bpmRange(lo: number | null, hi: number | null): string {
  if (lo == null) return `< ${(hi ?? 0) + 1}`;
  if (hi == null) return `≥ ${lo}`;
  return `${lo}–${hi}`;
}

function paceRange(slow: number | null, fast: number | null): string {
  if (slow == null && fast != null) return `slower than ${pace(fast)}`;
  if (fast == null && slow != null) return `faster than ${pace(slow + 1)}`;
  return `${pace(slow ?? 0)} – ${pace(fast ?? 0)}`;
}

export default function ZonesScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const z = q.data?.zones ?? null;
  const save = useMutation({
    mutationFn: (body: SettingsIn) => api.putSettings(body),
    onSuccess: (data: SettingsOut) => {
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries();
    },
  });
  const ref = z?.basis === "lthr" ? z.lthr : z?.hr_max;

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <DetailHeader title="Training zones" subtitle="Calibrated to your max and threshold HR" />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.text}>Cannot reach the backend ({String(q.error)})</Text> : null}

          <Surface style={styles.hero}>
            <View style={styles.anchor}>
              <Text style={styles.anchorLabel}>THRESHOLD HR</Text>
              <Text style={styles.anchorVal}>{z?.lthr ? Math.round(z.lthr) : "–"}<Text style={styles.unit}> bpm</Text></Text>
              <Text style={styles.method}>{z?.lthr_source ? LTHR_SOURCE[z.lthr_source] : "no estimate"}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.anchor}>
              <Text style={styles.anchorLabel}>MAX HR</Text>
              <Text style={styles.anchorVal}>{z?.hr_max ?? "–"}<Text style={styles.unit}> bpm</Text></Text>
              <Text style={styles.method}>{z?.hr_max_method ? HR_MAX_METHOD[z.hr_max_method] ?? z.hr_max_method : ""}</Text>
            </View>
          </Surface>

          <View style={styles.segment}>
            {(["lthr", "hr_max"] as const).map((b) => (
              <Pressable key={b} onPress={() => save.mutate({ zone_basis: b })} style={[styles.segItem, z?.basis === b && styles.segOn]}>
                <Text style={[styles.segText, z?.basis === b && { color: colors.text }]}>{b === "lthr" ? "From threshold HR" : "% of max HR"}</Text>
              </Pressable>
            ))}
          </View>

          <SectionLabel title="Heart-rate zones" note={z?.basis === "lthr" ? "% of threshold HR" : "% of max HR"} />
          <Surface style={styles.card}>
            {(z?.hr ?? []).map((r) => {
              const lo = r.lo_bpm ?? 0;
              const hi = r.hi_bpm ?? z?.hr_max ?? lo;
              const pctLo = ref ? Math.round((100 * lo) / ref) : null;
              return (
                <View key={r.zone} style={styles.zoneRow}>
                  <View style={[styles.tag, { backgroundColor: `${ZONE_COLORS[r.zone - 1]}26` }]}>
                    <Text style={[styles.tagText, { color: ZONE_COLORS[r.zone - 1] }]}>Z{r.zone}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.zoneName}>{r.name}</Text>
                    <Text style={styles.method}>{r.lo_bpm == null ? `below ${Math.round((100 * hi) / (ref ?? 1)) + 1}%` : `from ${pctLo}%`}</Text>
                  </View>
                  <Text style={styles.zoneVal}>{bpmRange(r.lo_bpm, r.hi_bpm)}<Text style={styles.unit}> bpm</Text></Text>
                </View>
              );
            })}
            {z?.lthr_source && z.lthr_source !== "user" && z.lthr_source !== "ours" && z.basis === "lthr" ? (
              <Text style={styles.text}>
                {z.lthr_source === "effort_floor"
                  ? "Threshold HR is a floor: you held a heart rate for 10 minutes that only fits a threshold at least this high. A 30-minute steady hard run measures it directly."
                  : "Threshold HR is still 89% of your max HR. A hard 10-minute stretch or a 30-minute steady hard run calibrates it."}
              </Text>
            ) : null}
          </Surface>

          <SectionLabel title="Your threshold HR" note={q.data?.lthr.set_value ? "set by you" : "optional"} />
          <Surface style={styles.card}>
            <Text style={styles.text}>From a lab test or a 30-minute time trial (average HR of the last 20 minutes). Overrides our estimate.</Text>
            <LthrSetter
              key={String(q.data?.lthr.set_value)}
              setValue={q.data?.lthr.set_value ?? null}
              onSave={(v) => save.mutate({ lthr: v })}
              onClear={() => save.mutate({ clear_lthr: true })}
            />
          </Surface>

          <SectionLabel title="Pace zones" note={z?.threshold_pace_s_per_km ? `threshold ${pace(z.threshold_pace_s_per_km)} · ${z.threshold_pace_source === "ours" ? "ours" : "COROS"}` : undefined} />
          <Surface style={styles.card}>
            {z?.pace ? (
              z.pace.map((r) => (
                <View key={r.zone} style={styles.zoneRow}>
                  <View style={[styles.tag, { backgroundColor: `${ZONE_COLORS[r.zone - 1]}26` }]}>
                    <Text style={[styles.tagText, { color: ZONE_COLORS[r.zone - 1] }]}>Z{r.zone}</Text>
                  </View>
                  <Text style={[styles.zoneName, { flex: 1 }]}>{r.name}</Text>
                  <Text style={styles.paceVal}>{paceRange(r.slow_s, r.fast_s)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.text}>Pace zones need a threshold pace (ours from critical speed or a 30-minute effort, else COROS&apos;s).</Text>
            )}
            {z?.threshold_pace_source === "coros" ? (
              <Text style={styles.text}>Using COROS&apos;s threshold pace until ours lands from critical speed or a 30-minute hard run.</Text>
            ) : null}
          </Surface>

          <Text style={styles.footer}>
            Threshold zones follow Joe Friel&apos;s running zones: Z2 from 85%, Z3 90%, Z4 95%, Z5 at threshold and above. Workouts, cardio focus and heart-rate recovery all use these.
          </Text>
          {save.isError ? <Text style={[styles.text, { color: colors.recoveryRed }]}>Could not save: {String(save.error)}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { flexDirection: "row", alignItems: "stretch", marginBottom: spacing.md },
  anchor: { flex: 1, gap: 2 },
  anchorLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  anchorVal: { fontFamily: fonts.numeral, fontSize: 34, color: colors.text },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.hairline, marginHorizontal: spacing.md },
  unit: { fontSize: 13, fontFamily: fonts.label, color: colors.textMuted },
  method: { ...font.caption, color: colors.textFaint },
  card: { marginBottom: spacing.md, gap: 10 },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 2 },
  tag: { width: 34, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  tagText: { fontFamily: fonts.numeral, fontSize: 14 },
  zoneName: { ...font.heading, fontSize: 15, color: colors.text },
  zoneVal: { fontFamily: fonts.numeral, fontSize: 18, color: colors.text },
  paceVal: { fontFamily: fonts.numeral, fontSize: 16, color: colors.text },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.pill, padding: 3, marginBottom: spacing.sm },
  segItem: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: "center" },
  segOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  segText: { ...font.overline, fontSize: 11, color: colors.textMuted },
  setter: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: { width: 76, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: "rgba(0,0,0,0.25)", color: colors.text, textAlign: "center", fontFamily: fonts.numeral, fontSize: 17 },
  btn: { flex: 1, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: radius.pill, paddingVertical: 11, alignItems: "center" },
  btnText: { ...font.heading, fontSize: 14, color: colors.text },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline },
  btnGhostText: { ...font.label, color: colors.textMuted },
  footer: { ...font.caption, color: colors.textFaint, textAlign: "center", lineHeight: 17, marginTop: spacing.sm },
});
