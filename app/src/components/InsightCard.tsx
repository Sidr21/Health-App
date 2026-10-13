import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { LeafIcon } from "@/components/icons";
import type { Insight } from "@/lib/insight";
import { colors, font, spacing } from "@/theme/tokens";

const tone = { good: colors.recovery, neutral: colors.recoveryAmber, bad: colors.recoveryRed } as const;

/** "🌱 You're well recovered — …" card from Bevel's Recovery screen. */
export function InsightCard({ insight }: { insight: Insight }) {
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <LeafIcon size={15} color={tone[insight.tone]} />
        <Text style={styles.title}>{insight.title}</Text>
      </View>
      <Text style={styles.body}>{insight.body}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card },
  row: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: spacing.sm },
  title: { ...font.heading, color: colors.text, fontSize: 15 },
  body: { ...font.body, color: colors.textMuted, lineHeight: 21 },
});
