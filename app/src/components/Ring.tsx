import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors, font } from "@/theme/tokens";

interface Props {
  progress: number | null;
  label: string;
  value: string;
  color: string;
  size?: number;
  stroke?: number;
}

/** Thin ring with the value inside and a label below, like Bevel's Home card. */
export function Ring({ progress, label, value, color, size = 96, stroke = 6 }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = progress == null ? 0 : Math.max(0.01, Math.min(1, progress));
  return (
    <View style={[styles.wrap, { width: size }]} accessibilityLabel={`${label} ${value}`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.ring} strokeWidth={stroke} fill="none" />
        {progress != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center, { height: size }]}>
        <Text style={[styles.value, { fontSize: size * 0.23 }]}>{value}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  value: { color: colors.text, fontWeight: "600", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  label: { ...font.label, color: colors.textMuted, marginTop: 10 },
});
