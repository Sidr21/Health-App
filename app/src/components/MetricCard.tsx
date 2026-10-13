import React, { type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Sparkline } from "@/components/Sparkline";
import { ArrowDownCircle, ArrowUpCircle, CheckCircle, type IconProps } from "@/components/icons";
import { colors, font, spacing } from "@/theme/tokens";

export type Tone = "good" | "neutral" | "bad";

interface Props {
  icon: ComponentType<IconProps>;
  title: string;
  value: string;
  unit?: string;
  status?: { label: string; tone: Tone; direction?: "up" | "down" } | null;
  series?: (number | null)[];
  band?: { low: number; high: number } | null;
  color: string;
  onPress?: () => void;
}

const toneColor: Record<Tone, string> = { good: colors.recovery, neutral: colors.textMuted, bad: colors.cardio };

/** "♡ Resting HR · 49 bpm · ✓ Normal · sparkline" card from Bevel's Home screen. */
export function MetricCard({ icon: Icon, title, value, unit, status, series, band, color, onPress }: Props) {
  const StatusIcon = status?.direction === "down" ? ArrowDownCircle : status?.direction === "up" ? ArrowUpCircle : CheckCircle;
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.titleRow}>
        <Icon size={15} color={colors.textMuted} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.value}>
            {value}
            {unit ? <Text style={styles.unit}> {unit}</Text> : null}
          </Text>
          {status ? (
            <View style={styles.statusRow}>
              <StatusIcon size={14} color={toneColor[status.tone]} />
              <Text style={[styles.status, { color: toneColor[status.tone] }]}>{status.label}</Text>
            </View>
          ) : null}
        </View>
        {series ? <Sparkline values={series} color={color} band={band} width={120} height={44} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  title: { ...font.label, color: colors.textMuted },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  value: { ...font.number, color: colors.text },
  unit: { fontSize: 16, fontWeight: "500", color: colors.textMuted },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  status: { ...font.label },
});
