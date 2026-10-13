import React, { type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import type { IconProps } from "@/components/icons";
import { colors, font, radius, spacing } from "@/theme/tokens";

/** Two-up stat tile ("Time in Bed · 8h 16m"). */
export function StatTile({ icon: Icon, label, value, bg }: { icon?: ComponentType<IconProps>; label: string; value: string; bg?: string }) {
  return (
    <View style={[styles.tile, bg ? { backgroundColor: bg } : null]}>
      <View style={styles.labelRow}>
        {Icon ? <Icon size={13} color={colors.textMuted} /> : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export type Grade = "Excellent" | "Good" | "Fair" | "Poor";

export const gradeColor: Record<Grade, string> = {
  Excellent: colors.sleep,
  Good: colors.recovery,
  Fair: colors.recoveryAmber,
  Poor: colors.strain,
};

export function gradeFor(frac: number | null | undefined): Grade | null {
  if (frac == null) return null;
  if (frac >= 0.9) return "Excellent";
  if (frac >= 0.7) return "Good";
  if (frac >= 0.45) return "Fair";
  return "Poor";
}

/** Bevel's "Good · Time Asleep" grade cell with a small colored bar. */
export function GradeCell({ icon: Icon, grade, label, frac }: { icon: ComponentType<IconProps>; grade: Grade | null; label: string; frac: number | null }) {
  const c = grade ? gradeColor[grade] : colors.textFaint;
  const w = 76;
  return (
    <View style={styles.grade}>
      <Icon size={16} color={colors.textFaint} />
      <Text style={[styles.gradeText, { color: colors.text }]}>{grade ?? "–"}</Text>
      <Text style={styles.gradeLabel}>{label}</Text>
      <Svg width={w} height={4} style={{ marginTop: 8 }}>
        <Rect x={0} y={0} width={w} height={4} rx={2} fill={colors.hairline} />
        {frac != null ? <Rect x={0} y={0} width={Math.max(6, w * Math.min(1, frac))} height={4} rx={2} fill={c} /> : null}
      </Svg>
    </View>
  );
}

export function Panel({ children, bg, style }: { children: React.ReactNode; bg?: string; style?: object }) {
  return <View style={[styles.panel, bg ? { backgroundColor: bg } : null, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  tile: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { ...font.label, color: colors.textMuted },
  value: { ...font.number, fontSize: 24, color: colors.text, marginTop: 8 },
  grade: { width: "50%", alignItems: "center", paddingVertical: 14 },
  gradeText: { ...font.heading, marginTop: 6 },
  gradeLabel: { ...font.caption, color: colors.textMuted, marginTop: 2 },
  panel: { backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.lg, marginBottom: spacing.md },
});
