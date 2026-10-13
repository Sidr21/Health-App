import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, font, spacing } from "@/theme/tokens";

/** Placeholder until phase 4/5 (see docs/DESIGN.md §7). */
export default function BiologyScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <Text style={styles.title}>Biology</Text>
      <Text style={styles.body}>Coming in a later phase.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
  title: { ...font.title, color: colors.text },
  body: { ...font.body, color: colors.textMuted, marginTop: spacing.sm },
});
