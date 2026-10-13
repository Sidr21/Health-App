import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_URL } from "@/lib/api";
import { enableBackgroundDelivery, healthKitAvailable, requestHealthKitAccess, syncHealthKit } from "@/lib/healthkit";
import { colors, font, radius, spacing } from "@/theme/tokens";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [log, setLog] = useState<string>("");
  const run = async () => {
    try {
      if (!(await healthKitAvailable())) return setLog("HealthKit not available on this device/build");
      const ok = await requestHealthKitAccess();
      if (!ok) return setLog("Permission request did not complete");
      await enableBackgroundDelivery();
      const r = await syncHealthKit();
      setLog(`Synced ${r.types} types: ${r.stored} new, ${r.skipped} already stored, ${r.unknown_type} ignored`);
    } catch (e) {
      setLog(String(e));
    }
  };
  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.label}>Backend: {API_URL}</Text>
      <Pressable onPress={run} style={styles.button}>
        <Text style={styles.buttonText}>Connect Apple Health & sync now</Text>
      </Pressable>
      {log ? <Text style={styles.log}>{log}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  title: { ...font.title, color: colors.text, marginBottom: spacing.lg },
  label: { ...font.label, color: colors.textMuted, marginBottom: spacing.lg },
  button: { backgroundColor: colors.cardRaised, padding: spacing.lg, borderRadius: radius.md, alignItems: "center" },
  buttonText: { ...font.heading, color: colors.text },
  log: { ...font.body, color: colors.textMuted, marginTop: spacing.lg },
});
