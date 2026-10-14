import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { API_URL, ApiError, api } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { enableBackgroundDelivery, healthKitAvailable, requestHealthKitAccess, syncHealthKit } from "@/lib/healthkit";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const METRIC_LABEL: Record<string, string> = {
  weight_kg: "Weight",
  bmi: "BMI",
  body_fat_pct: "Body fat",
  lean_mass_kg: "Lean mass",
  height_cm: "Height",
  waist_cm: "Waist",
  bp_sys: "Blood pressure (sys)",
  bp_dia: "Blood pressure (dia)",
  spo2_pct: "Blood oxygen",
  resp_rate: "Respiratory rate",
  vo2max_apple: "VO₂max (Apple)",
  kcal_in: "Energy eaten",
  water_ml: "Water",
  caffeine_mg: "Caffeine",
};

const SOURCE_LABEL: Record<string, string> = { coros: "COROS strength mode", strong: "Strong", hevy: "Hevy", manual: "Logged in the app" };

function Status({ ok, label }: { ok: boolean | null; label: string }) {
  const c = ok == null ? colors.textFaint : ok ? colors.recovery : colors.recoveryAmber;
  return (
    <View style={[styles.pill, { borderColor: `${c}55`, backgroundColor: `${c}18` }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.pillText, { color: c }]}>{label}</Text>
    </View>
  );
}

function Button({ label, onPress, disabled, tone = "solid" }: { label: string; onPress: () => void; disabled?: boolean; tone?: "solid" | "ghost" | "danger" }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[tone === "solid" ? styles.btn : styles.btnGhost, disabled && { opacity: 0.45 }]}
    >
      <Text style={[styles.btnText, tone === "danger" && { color: colors.recoveryRed }, tone === "ghost" && { color: colors.textMuted }]}>{label}</Text>
    </Pressable>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineK}>{k}</Text>
      <Text style={styles.lineV}>{v}</Text>
    </View>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    try {
      return JSON.parse(e.message).detail ?? e.message;
    } catch {
      return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

export default function ConnectionsScreen() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["connections"],
    queryFn: api.connections,
    refetchInterval: (query) => (query.state.data?.coros.sync.running ? 3000 : 60_000),
  });
  const server = useQuery({ queryKey: ["server-health"], queryFn: api.health, retry: false });
  const c = q.data;
  const [corosMsg, setCorosMsg] = useState<string | null>(null);
  const [appleMsg, setAppleMsg] = useState<string | null>(null);
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [unit, setUnit] = useState<"lb" | "kg">("lb");
  const refresh = () => qc.invalidateQueries();

  const connect = useMutation({
    mutationFn: async () => {
      const link = Linking.createURL("connections");
      // the server only sends the browser back to app links (not http, as in the web preview)
      const returnTo = /^(healthapp|exp\+health-app):\/\//.test(link) ? link : undefined;
      const { auth_url } = await api.corosLoginStart(returnTo);
      return WebBrowser.openAuthSessionAsync(auth_url, returnTo ?? null);
    },
    onSuccess: (r) => {
      setCorosMsg(r.type === "success" ? "Connected. Pulling the last 30 days now." : "Login closed before it finished.");
      refresh();
    },
    onError: (e) => setCorosMsg(errorText(e)),
  });
  const syncNow = useMutation({ mutationFn: api.syncNow, onSuccess: refresh, onError: (e) => setCorosMsg(errorText(e)) });
  const disconnect = useMutation({ mutationFn: api.corosDisconnect, onSuccess: refresh });

  const connectApple = useMutation({
    mutationFn: async () => {
      if (!(await healthKitAvailable())) throw new Error("Apple Health is only available in the iPhone app, not in this web preview.");
      if (!(await requestHealthKitAccess())) throw new Error("Permission request did not complete.");
      await enableBackgroundDelivery();
      return syncHealthKit();
    },
    onSuccess: (r) => {
      setAppleMsg(`Synced ${r.types} types: ${r.stored} new, ${r.skipped} already stored.`);
      refresh();
    },
    onError: (e) => setAppleMsg(String(e instanceof Error ? e.message : e)),
  });

  const importCsv = useMutation({
    mutationFn: async () => {
      const pick = await DocumentPicker.getDocumentAsync({ type: ["text/csv", "text/comma-separated-values", "public.comma-separated-values-text", "*/*"], copyToCacheDirectory: true });
      if (pick.canceled) return null;
      const text = await (await fetch(pick.assets[0].uri)).text();
      return api.importStrengthCsv(text, unit);
    },
    onSuccess: (r) => {
      if (r) {
        setCsvMsg(`Imported ${r.sessions} sessions (${r.sets} sets) from ${SOURCE_LABEL[r.source] ?? r.source}.`);
        refresh();
      }
    },
    onError: (e) => setCsvMsg(errorText(e)),
  });

  const sync = c?.coros.sync;
  const corosOk = c ? c.coros.connected && sync?.last_ok !== false : null;
  const corosLabel = !c ? "…" : !c.coros.connected ? "Not connected" : sync?.last_ok === false ? "Needs attention" : "Connected";

  return (
    <View style={styles.screen}>
      <Backdrop glow="home" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Connections" subtitle="Where your data comes from" />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.error}>Cannot reach the backend at {API_URL} ({errorText(q.error)})</Text> : null}

          <SectionLabel title="COROS" note="workouts, sleep, HRV, stress, load" />
          <Surface style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.name}>COROS</Text>
              <Status ok={corosOk} label={corosLabel} />
            </View>
            {c?.coros.connected ? (
              <>
                <Line k="Last sync" v={timeAgo(c.coros.last_sync)} />
                <Line k="Newest workout" v={timeAgo(c.coros.newest_activity)} />
                <Line k="Background sync" v={sync?.enabled ? `every ${sync.interval_min} min${sync.running ? " · running" : ""}` : "off on this server"} />
                {sync?.last_error ? <Text style={styles.warn}>{sync.last_error}</Text> : null}
                <View style={styles.row}>
                  <Button label={sync?.running ? "Syncing…" : "Sync now"} onPress={() => syncNow.mutate()} disabled={sync?.running || syncNow.isPending} />
                  <Button
                    label="Disconnect"
                    tone="danger"
                    onPress={() =>
                      Alert.alert("Disconnect COROS?", "The server forgets your COROS login and stops syncing. Your data stays.", [
                        { text: "Cancel", style: "cancel" },
                        { text: "Disconnect", style: "destructive", onPress: () => disconnect.mutate() },
                      ])
                    }
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={styles.text}>Log in to COROS once; the server then syncs every 15 minutes on its own, with your phone and Mac off.</Text>
                <Button label={connect.isPending ? "Opening COROS…" : "Connect COROS"} onPress={() => connect.mutate()} disabled={connect.isPending || !c} />
                <Text style={styles.hint}>If the COROS page refuses, log in from a Mac instead (uv run health coros auth) and give the server the token: docs/SETUP.md §3.</Text>
              </>
            )}
            {corosMsg ? <Text style={styles.hint}>{corosMsg}</Text> : null}
          </Surface>

          <SectionLabel title="Apple Health" note="body, vitals, sleep stages" />
          <Surface style={styles.card}>
            <View style={styles.head}>
              <Text style={styles.name}>Apple Health</Text>
              <Status ok={c ? !!c.apple_health.last_sample : null} label={c?.apple_health.last_sample ? `Last sample ${timeAgo(c.apple_health.last_sample)}` : "No data yet"} />
            </View>
            {(c?.apple_health.metrics ?? []).map((m) => (
              <Line key={m.metric} k={METRIC_LABEL[m.metric] ?? m.metric} v={`${m.samples} · ${timeAgo(m.latest)}`} />
            ))}
            {c?.apple_health.sleep_nights ? <Line k="Sleep stages" v={`${c.apple_health.sleep_nights} nights`} /> : null}
            <Button label={connectApple.isPending ? "Syncing…" : c?.apple_health.last_sample ? "Sync now" : "Connect Apple Health"} onPress={() => connectApple.mutate()} disabled={connectApple.isPending} />
            <Text style={styles.hint}>Reads weight, body composition, height, waist, blood pressure, blood oxygen, respiratory rate, VO₂max, water, caffeine and sleep stages. Never writes. New samples arrive in the background.</Text>
            {appleMsg ? <Text style={styles.hint}>{appleMsg}</Text> : null}
          </Surface>

          <SectionLabel title="Lifting apps" note="Strong, Hevy" />
          <Surface style={styles.card}>
            {(c?.strength ?? []).length ? (
              c!.strength.map((s) => <Line key={s.source} k={SOURCE_LABEL[s.source] ?? s.source} v={`${s.sets} sets · ${timeAgo(s.latest)}`} />)
            ) : (
              <Text style={styles.text}>No lifting data yet.</Text>
            )}
            <View style={styles.row}>
              <View style={styles.segment}>
                {(["lb", "kg"] as const).map((u) => (
                  <Pressable key={u} onPress={() => setUnit(u)} style={[styles.segItem, unit === u && styles.segOn]}>
                    <Text style={[styles.segText, unit === u && { color: colors.text }]}>{u}</Text>
                  </Pressable>
                ))}
              </View>
              <Button label={importCsv.isPending ? "Importing…" : "Import CSV"} onPress={() => importCsv.mutate()} disabled={importCsv.isPending} />
            </View>
            <Text style={styles.hint}>Export from Strong (Settings → Export data) or Hevy (Settings → Export & import data). Re-importing replaces the same sessions; pick kg if your export has no unit column.</Text>
            {csvMsg ? <Text style={styles.hint}>{csvMsg}</Text> : null}
          </Surface>

          <SectionLabel title="Server" />
          <Surface style={styles.card}>
            <View style={styles.head}>
              <Text style={[styles.name, { fontSize: 14, flex: 1 }]} numberOfLines={1}>{API_URL}</Text>
              <Status ok={server.isError ? false : server.data ? true : null} label={server.isError ? "Unreachable" : server.data ? "Online" : "…"} />
            </View>
            {c ? <Line k="Version" v={`${c.server.version}${c.server.public ? " · cloud" : " · local"}`} /> : null}
            {c ? <Line k="Time zone" v={c.server.tz} /> : null}
          </Surface>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  card: { marginBottom: spacing.md, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  name: { ...font.heading, fontSize: 17, color: colors.text },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { ...font.caption, fontFamily: fonts.label },
  dot: { width: 7, height: 7, borderRadius: 4 },
  line: { flexDirection: "row", justifyContent: "space-between" },
  lineK: { ...font.label, color: colors.textMuted },
  lineV: { ...font.label, color: colors.text },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  hint: { ...font.caption, color: colors.textFaint, lineHeight: 17 },
  warn: { ...font.caption, color: colors.recoveryAmber, lineHeight: 17 },
  error: { ...font.caption, color: colors.recoveryRed, marginVertical: spacing.sm },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  btn: { flex: 1, backgroundColor: "rgba(255,255,255,0.10)", borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  btnGhost: { flex: 1, borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  btnText: { ...font.heading, fontSize: 14, color: colors.text },
  segment: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.05)", borderRadius: radius.pill, padding: 3 },
  segItem: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill },
  segOn: { backgroundColor: "rgba(255,255,255,0.12)" },
  segText: { ...font.overline, fontSize: 11, color: colors.textMuted },
});
