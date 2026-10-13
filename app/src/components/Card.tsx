import React, { type PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";

import { colors, font, radius, spacing } from "@/theme/tokens";

interface Props {
  title?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ title, onPress, style, children }: PropsWithChildren<Props>) {
  const body = (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.85 } : undefined)}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  title: { ...font.label, color: colors.textMuted, marginBottom: spacing.sm },
});
