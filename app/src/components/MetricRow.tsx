import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";
import { colors, font, spacing } from "@/theme/tokens";

interface Props {
  title: string;
  value: string;
  unit?: string;
  status?: { label: string; tone: "good" | "neutral" | "bad" } | null;
  series?: (number | null)[];
  band?: { low: number; high: number } | null;
  color: string;
  onPress?: () => void;
}

const toneColor = { good: colors.recovery, neutral: colors.textMuted, bad: colors.cardio } as const;

/** "Resting HR · 57 bpm · Normal · sparkline" card from Bevel's Home screen. */
export function MetricRow({ title, value, unit, status, series, band, color, onPress }: Props) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.value}>
            {value}
            {unit ? <Text style={styles.unit}> {unit}</Text> : null}
          </Text>
          {status ? (
            <Text style={[styles.status, { color: toneColor[status.tone] }]}>{status.label}</Text>
          ) : null}
        </View>
        {series ? <Sparkline values={series} color={color} band={band} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  title: { ...font.label, color: colors.textMuted },
  value: { ...font.number, color: colors.text, marginTop: 2 },
  unit: { ...font.body, color: colors.textMuted },
  status: { ...font.label, marginTop: 2 },
});
