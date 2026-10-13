import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { API_URL, api, type SettingsIn, type SettingsOut } from "@/lib/api";
import { enableBackgroundDelivery, healthKitAvailable, requestHealthKitAccess, syncHealthKit } from "@/lib/healthkit";
import { height as fmtHeight, setUnits } from "@/lib/units";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const METHOD: Record<string, string> = {
  age_formula: "Age formula (208 − 0.7 × age)",
  observed: "Highest HR in your workouts",
  user: "Set by you",
  field_test: "Field test",
};

function Segmented<T extends string>({ value, options, onChange }: { value: T | null; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => (
        <Pressable key={o.v} onPress={() => onChange(o.v)} style={[styles.segItem, value === o.v && styles.segOn]}>
          <Text style={[styles.segText, value === o.v && { color: colors.text }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Text field that commits on blur; remount it (key) to reset it to a new saved value. */
function DraftInput({ initial, placeholder, numeric, width = 84, valid, onCommit }: {
  initial: string;
  placeholder: string;
  numeric?: boolean;
  width?: number;
  valid: (t: string) => boolean;
  onCommit: (t: string) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <TextInput
      value={text}
      onChangeText={(t) => setText(numeric ? t.replace(/[^0-9.]/g, "") : t)}
      onBlur={() => text !== initial && valid(text) && onCommit(text)}
      keyboardType={numeric ? "decimal-pad" : "default"}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      style={[styles.input, { width }]}
    />
  );
}

function HrMaxSetter({ setValue, onSave, onClear }: { setValue: number | null; onSave: (v: number) => void; onClear: () => void }) {
  const [text, setText] = useState(setValue ? String(setValue) : "");
  const ok = Number(text) >= 120 && Number(text) <= 230;
  return (
    <>
      <Row label="Set HRmax" hint="From a field test or a race finish. Overrides the estimate.">
        <TextInput
          value={text}
          onChangeText={(t) => setText(t.replace(/[^0-9]/g, ""))}
          keyboardType="number-pad"
          placeholder="bpm"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />
      </Row>
      <View style={styles.btnRow}>
        <Pressable style={[styles.btn, !ok && { opacity: 0.4 }]} disabled={!ok} onPress={() => onSave(Number(text))}>
          <Text style={styles.btnText}>Save as field test</Text>
        </Pressable>
        {setValue ? (
          <Pressable style={styles.btnGhost} onPress={onClear}>
            <Text style={styles.btnGhostText}>Use estimate</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} min ago`;
  if (mins < 48 * 60) return `${Math.round(mins / 60)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function SettingsScreen() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const st = q.data;
  const [log, setLog] = useState("");
  const [now] = useState(() => Date.now());

  const save = useMutation({
    mutationFn: (body: SettingsIn) => api.putSettings(body),
    onSuccess: (data: SettingsOut) => {
      setUnits(data.units);
      qc.setQueryData(["settings"], data);
      qc.invalidateQueries(); // units, HRmax and zones change what other screens show
    },
  });

  const connectHealth = async () => {
    try {
      if (!(await healthKitAvailable())) return setLog("Apple Health is only available in the iPhone build, not in this web preview.");
      if (!(await requestHealthKitAccess())) return setLog("Permission request did not complete.");
      await enableBackgroundDelivery();
      const r = await syncHealthKit();
      setLog(`Synced ${r.types} types: ${r.stored} new, ${r.skipped} already stored.`);
      qc.invalidateQueries();
    } catch (e) {
      setLog(String(e));
    }
  };

  const age = st?.profile.dob ? Math.floor((now - new Date(st.profile.dob).getTime()) / (365.25 * 86_400_000)) : null;
  const need = st?.sleep_need_min ?? 480;

  return (
    <View style={styles.screen}>
      <Backdrop glow="home" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} keyboardShouldPersistTaps="handled">
        <DetailHeader title="Settings" mode="close" />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.error}>Cannot reach the backend at {API_URL} ({String(q.error)})</Text> : null}

          <SectionLabel title="Heart" note="drives zones and fitness models" />
          <Surface style={styles.card}>
            <View style={styles.hrHead}>
              <Text style={styles.hrBig}>{st?.hr_max.effective ?? "–"}<Text style={styles.unit}> bpm</Text></Text>
              <Text style={styles.hint}>{st?.hr_max.method ? METHOD[st.hr_max.method] ?? st.hr_max.method : "No estimate yet"}</Text>
            </View>
            {Object.entries(st?.hr_max.candidates ?? {}).map(([k, v]) => (
              <View key={k} style={styles.cand}>
                <Text style={[styles.candLabel, k === st?.hr_max.method && { color: colors.text }]}>{METHOD[k] ?? k}</Text>
                <Text style={[styles.candVal, k === st?.hr_max.method && { color: colors.recovery }]}>{v}</Text>
              </View>
            ))}
            <HrMaxSetter
              key={String(st?.hr_max.set_value)}
              setValue={st?.hr_max.set_value ?? null}
              onSave={(v) => save.mutate({ hr_max: v, hr_max_source: "field_test" })}
              onClear={() => save.mutate({ clear_hr_max: true })}
            />
            <Text style={styles.hint}>The HRmax test workout is in your COROS workout library (docs/engine/hrmax-test.md).</Text>
          </Surface>

          <SectionLabel title="Profile" note="from COROS, editable" />
          <Surface style={styles.card}>
            <Row label="Sex">
              <Segmented value={(st?.profile.sex as "male" | "female") ?? null} options={[{ v: "male", label: "Male" }, { v: "female", label: "Female" }]} onChange={(v) => save.mutate({ sex: v })} />
            </Row>
            <Row label="Birthday" hint={age != null ? `${age} years` : undefined}>
              <DraftInput
                key={`dob-${st?.profile.dob}`}
                initial={st?.profile.dob ?? ""}
                placeholder="YYYY-MM-DD"
                width={118}
                valid={(t) => /^\d{4}-\d{2}-\d{2}$/.test(t)}
                onCommit={(t) => save.mutate({ dob: t })}
              />
            </Row>
            <Row label="Height" hint={st?.profile.height_cm ? fmtHeight(st.profile.height_cm, "imperial") : undefined}>
              <DraftInput
                key={`h-${st?.profile.height_cm}`}
                initial={st?.profile.height_cm ? String(Math.round(st.profile.height_cm)) : ""}
                placeholder="cm"
                numeric
                valid={(t) => Number(t) >= 100 && Number(t) <= 250}
                onCommit={(t) => save.mutate({ height_cm: Number(t) })}
              />
            </Row>
          </Surface>

          <SectionLabel title="Sleep" />
          <Surface style={styles.card}>
            <Row label="Sleep need" hint="Target for the sleep score and tonight's plan">
              <View style={styles.stepper}>
                <Pressable style={styles.stepBtn} onPress={() => need > 300 && save.mutate({ sleep_need_min: need - 15 })}><Text style={styles.stepText}>−</Text></Pressable>
                <Text style={styles.stepVal}>{Math.floor(need / 60)}h {String(need % 60).padStart(2, "0")}m</Text>
                <Pressable style={styles.stepBtn} onPress={() => need < 660 && save.mutate({ sleep_need_min: need + 15 })}><Text style={styles.stepText}>+</Text></Pressable>
              </View>
            </Row>
          </Surface>

          <SectionLabel title="Units" />
          <Surface style={styles.card}>
            <Row label="Distance, weight, height" hint={st?.units === "metric" ? "km · kg · cm" : "mi · lb · ft/in"}>
              <Segmented value={st?.units ?? null} options={[{ v: "imperial", label: "Imperial" }, { v: "metric", label: "Metric" }]} onChange={(v) => save.mutate({ units: v })} />
            </Row>
          </Surface>

          <SectionLabel title="Data sources" />
          <Surface style={styles.card}>
            <Row label="COROS" hint={`Last sync ${ago(st?.sources.coros_last_sync ?? null)} · newest workout ${ago(st?.sources.newest_activity ?? null)}`}>
              <View style={[styles.dot, { backgroundColor: st?.sources.coros_last_sync ? colors.recovery : colors.recoveryAmber }]} />
            </Row>
            <Row label="Apple Health" hint={`Newest sample ${ago(st?.sources.apple_last_sample ?? null)}`}>
              <View style={[styles.dot, { backgroundColor: st?.sources.apple_last_sample ? colors.recovery : colors.textFaint }]} />
            </Row>
            <Pressable onPress={connectHealth} style={[styles.btn, { marginTop: spacing.sm }]}>
              <Text style={styles.btnText}>Connect Apple Health & sync now</Text>
            </Pressable>
            {log ? <Text style={styles.hint}>{log}</Text> : null}
            <Text style={[styles.hint, { marginTop: spacing.md }]}>Backend {API_URL} · time zone {st?.timezone ?? "–"}</Text>
          </Surface>
          {save.isError ? <Text style={styles.error}>Could not save: {String(save.error)}</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  card: { marginBottom: spacing.md, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  rowLabel: { ...font.heading, fontSize: 15, color: colors.text },
  hint: { ...font.caption, color: colors.textMuted, marginTop: 2, lineHeight: 17 },
  hrHead: { marginBottom: 2 },
  hrBig: { fontFamily: fonts.numeral, fontSize: 40, color: colors.text },
  unit: { fontSize: 15, fontFamily: fonts.label, color: colors.textMuted },
  cand: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  candLabel: { ...font.label, color: colors.textMuted },
  candVal: { fontFamily: fonts.numeral, fontSize: 16, color: colors.textMuted },
  input: { width: 84, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: "rgba(0,0,0,0.25)", color: colors.text, textAlign: "center", fontFamily: fonts.numeral, fontSize: 17 },
  btnRow: { flexDirection: "row", gap: 8 },
  btn: { flex: 1, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  btnText: { ...font.heading, fontSize: 14, color: colors.text },
  btnGhost: { paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.hairline, justifyContent: "center" },
  btnGhostText: { ...font.label, color: colors.textMuted },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.pill, padding: 3 },
  segItem: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  segOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  segText: { ...font.overline, fontSize: 11, color: colors.textMuted },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  stepText: { ...font.heading, color: colors.text },
  stepVal: { fontFamily: fonts.numeral, fontSize: 17, color: colors.text, width: 64, textAlign: "center" },
  dot: { width: 10, height: 10, borderRadius: 5 },
  error: { ...font.caption, color: colors.recoveryRed, marginVertical: spacing.sm },
});
