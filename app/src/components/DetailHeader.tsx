import { router } from "expo-router";
import React, { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronDown, ChevronLeft, CloseIcon } from "@/components/icons";
import { colors, spacing } from "@/theme/tokens";

interface Props {
  title: string;
  subtitle?: string;
  dropdown?: boolean;
  mode?: "back" | "close";
  right?: ReactNode;
  tint?: string;
}

/** Bevel's detail header: round back/close button, centered title with a date dropdown beneath. */
export function DetailHeader({ title, subtitle, dropdown, mode = "back", right, tint }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable onPress={() => router.back()} style={[styles.round, tint ? { backgroundColor: tint } : null]}>
        {mode === "back" ? <ChevronLeft size={20} color={colors.text} /> : <CloseIcon size={18} color={colors.text} />}
      </Pressable>
      <View style={styles.center}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? (
          <View style={styles.subRow}>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {dropdown ? <ChevronDown size={14} color={colors.textMuted} /> : null}
          </View>
        ) : null}
      </View>
      <View style={styles.side}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  round: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(255,255,255,0.08)", alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center" },
  title: { fontSize: 20, fontWeight: "600", color: colors.text },
  subRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  subtitle: { fontSize: 14, color: colors.textMuted },
  side: { width: 42, alignItems: "flex-end" },
});
