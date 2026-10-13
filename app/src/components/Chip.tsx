import React, { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ChevronDown } from "@/components/icons";
import { Surface } from "@/components/Surface";
import { colors, font, radius } from "@/theme/tokens";

interface Props {
  icon: ReactNode;
  iconBg?: string;
  title: string;
  subtitle?: string;
  dropdown?: boolean;
  onPress?: () => void;
}

/** Bevel's status / weather chips under the Home header. */
export function Chip({ icon, iconBg, title, subtitle, dropdown, onPress }: Props) {
  return (
    <Surface onPress={onPress} padded={false} radiusSize={radius.pill} style={styles.chip}>
      <View style={[styles.iconWrap, iconBg ? { backgroundColor: iconBg } : null]}>{icon}</View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {dropdown ? <View style={{ marginLeft: "auto" }}><ChevronDown size={14} color={colors.textMuted} /></View> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 7,
    paddingLeft: 7,
    paddingRight: 12,
    flex: 1,
  },
  iconWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.cardRaised, alignItems: "center", justifyContent: "center" },
  title: { ...font.label, color: colors.text },
  subtitle: { ...font.caption, color: colors.textMuted, fontSize: 11 },
});
