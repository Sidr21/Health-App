import React, { type ComponentType, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { type IconProps } from "@/components/icons";
import { colors, font, radius } from "@/theme/tokens";

export interface WeekDay {
  iso: string;
  weekday: string; // "M"
  day: number;
  icon?: { Icon: ComponentType<IconProps>; color: string } | null;
  badge?: ReactNode;
  dim?: boolean;
}

interface Props {
  days: WeekDay[];
  selected: string;
  onSelect?: (iso: string) => void;
  variant?: "pills" | "circles";
}

/** Bevel's week strip: Fitness uses tall pills with the day's sport icon, Journal uses check circles. */
export function WeekStrip({ days, selected, onSelect, variant = "pills" }: Props) {
  return (
    <View style={styles.row}>
      {days.map((d) => {
        const active = d.iso === selected;
        if (variant === "circles") {
          return (
            <Pressable key={d.iso} onPress={() => onSelect?.(d.iso)} style={[styles.circleCol, active && styles.circleColActive]}>
              <Text style={[styles.circleDay, { color: active ? colors.cardio : d.dim ? colors.textFaint : colors.text }]}>{d.day}</Text>
              <View style={[styles.circle, d.badge ? styles.circleFilled : null, d.dim ? { borderColor: colors.hairline } : null]}>{d.badge}</View>
            </Pressable>
          );
        }
        return (
          <Pressable key={d.iso} onPress={() => onSelect?.(d.iso)} style={[styles.pill, active && styles.pillActive, d.dim && styles.pillDim]}>
            <Text style={[styles.weekday, d.dim && { color: colors.textFaint }]}>{d.weekday}</Text>
            <Text style={[styles.day, { color: active ? colors.cardio : d.dim ? colors.textFaint : colors.text }]}>{d.day}</Text>
            <View style={[styles.iconDot, d.icon ? { backgroundColor: `${d.icon.color}33` } : null]}>
              {d.icon ? <d.icon.Icon size={18} color={d.icon.color} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  pill: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 10,
    borderRadius: 28,
    backgroundColor: colors.card,
    alignItems: "center",
    gap: 6,
  },
  pillActive: { backgroundColor: colors.cardRaised },
  pillDim: { opacity: 0.55 },
  weekday: { ...font.caption, color: colors.textMuted },
  day: { fontSize: 19, fontWeight: "600", color: colors.text },
  iconDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.cardRaised, alignItems: "center", justifyContent: "center" },
  circleCol: { flex: 1, alignItems: "center", gap: 10, paddingVertical: 10, borderRadius: radius.md },
  circleColActive: { backgroundColor: colors.card },
  circleDay: { fontSize: 18, fontWeight: "600" },
  circle: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  circleFilled: { borderColor: colors.gold, backgroundColor: `${colors.gold}55` },
});
