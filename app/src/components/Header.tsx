import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ChevronDown } from "@/components/icons";
import { colors, font, spacing } from "@/theme/tokens";

interface Props {
  title: string;
  subtitle?: string;
  dropdown?: boolean;
  right?: ReactNode;
  left?: ReactNode;
  centered?: boolean;
}

/** Big-title page header. Bevel uses "Today, March 12 ⌄" on Home and "Journal / Oct 2026" elsewhere. */
export function Header({ title, subtitle, dropdown, right, left, centered }: Props) {
  if (centered) {
    return (
      <View style={styles.centerRow}>
        <View style={styles.side}>{left}</View>
        <Text style={styles.centerTitle}>{title}</Text>
        <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
      </View>
    );
  }
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Pressable style={styles.titleRow} disabled={!dropdown}>
          <Text style={styles.title}>{title}</Text>
          {dropdown ? <ChevronDown size={18} color={colors.textMuted} /> : null}
        </Pressable>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function RoundButton({ children, onPress }: { children: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.round}>
      {children}
    </Pressable>
  );
}

export function Avatar({ initials }: { initials: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { ...font.title, color: colors.text },
  subtitle: { ...font.body, color: colors.textMuted, marginTop: 2, fontSize: 17 },
  centerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  centerTitle: { ...font.heading, fontSize: 22, color: colors.text },
  side: { width: 48 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.cardRaised, alignItems: "center", justifyContent: "center" },
  avatarText: { ...font.label, color: colors.text, fontSize: 14 },
});
