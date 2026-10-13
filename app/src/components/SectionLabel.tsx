import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, font, spacing } from "@/theme/tokens";

/** Uppercase section label with an optional trailing note ("1 EVENT"). */
export function SectionLabel({ title, note, action }: { title: string; note?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: spacing.xl, marginBottom: spacing.md },
  title: { ...font.overline, color: colors.textMuted },
  note: { ...font.caption, color: colors.textFaint },
});
