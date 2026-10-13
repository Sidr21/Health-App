import React, { type PropsWithChildren } from "react";
import { StyleSheet, Text, type ViewStyle } from "react-native";

import { Surface, type SurfaceTone } from "@/components/Surface";
import { colors, font, radius, spacing } from "@/theme/tokens";

interface Props {
  title?: string;
  onPress?: () => void;
  style?: ViewStyle;
  tone?: SurfaceTone;
}

export function Card({ title, onPress, style, tone = "card", children }: PropsWithChildren<Props>) {
  return (
    <Surface tone={tone} onPress={onPress} radiusSize={radius.lg} style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  title: { ...font.label, color: colors.textMuted, marginBottom: spacing.sm },
});
