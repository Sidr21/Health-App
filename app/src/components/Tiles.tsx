import React, { type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import type { IconProps } from "@/components/icons";
import { Surface, type SurfaceTone } from "@/components/Surface";
import { colors, font, spacing } from "@/theme/tokens";

/** Two-up stat tile ("Time in Bed · 8h 16m"). */
export function StatTile({ icon: Icon, label, value, tone = "card" }: { icon?: ComponentType<IconProps>; label: string; value: string; tone?: SurfaceTone }) {
  return (
    <Surface tone={tone} style={styles.tile}>
      <View style={styles.labelRow}>
        {Icon ? <Icon size={13} color={colors.textMuted} /> : null}
        <Text style={styles.label}>{label}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </Surface>
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
        <Rect x={0} y={0} width={w} height={4} rx={2} fill="rgba(255,255,255,0.08)" />
        {frac != null ? <Rect x={0} y={0} width={Math.max(6, w * Math.min(1, frac))} height={4} rx={2} fill={c} /> : null}
      </Svg>
    </View>
  );
}

export function Panel({ children, tone = "card", style }: { children: React.ReactNode; tone?: SurfaceTone; style?: object }) {
  return <Surface tone={tone} style={[styles.panel, style]}>{children}</Surface>;
}

const styles = StyleSheet.create({
  tile: { flex: 1 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  label: { ...font.overline, fontSize: 11, color: colors.textMuted },
  value: { ...font.number, fontSize: 24, color: colors.text, marginTop: 8 },
  grade: { width: "50%", alignItems: "center", paddingVertical: 14 },
  gradeText: { ...font.heading, marginTop: 6 },
  gradeLabel: { ...font.overline, fontSize: 10, color: colors.textMuted, marginTop: 2 },
  panel: { marginBottom: spacing.md },
});
