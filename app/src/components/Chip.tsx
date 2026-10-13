import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChevronDown } from "@/components/icons";
import { colors, font, radius } from "@/theme/tokens";

interface Props {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  dropdown?: boolean;
  onPress?: () => void;
}

/** Bevel's status / weather chips under the Home header. */
export function Chip({ icon, title, subtitle, dropdown, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={styles.chip}>
      <View style={styles.iconWrap}>{icon}</View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {dropdown ? <ChevronDown size={14} color={colors.textMuted} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.pill,
    borderRadius: radius.pill,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.cardRaised, alignItems: "center", justifyContent: "center" },
  title: { ...font.label, color: colors.text },
  subtitle: { ...font.caption, color: colors.textMuted, fontSize: 11 },
});
