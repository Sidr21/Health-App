import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { colors, font } from "@/theme/tokens";

interface Props {
  /** 0..1, or null for "no data" */
  progress: number | null;
  label: string;
  /** Text rendered in the middle (e.g. "72%", "6.1", "–") */
  value: string;
  color: string;
  size?: number;
  stroke?: number;
}

/** Thin circular progress ring with the value inside, like Bevel's Home rings. */
export function Ring({ progress, label, value, color, size = 92, stroke = 7 }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = progress == null ? 0 : Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.wrap, { width: size }]} accessibilityLabel={`${label} ${value}`}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.ring} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={progress == null ? colors.textFaint : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center, { height: size }]}>
        <Text style={[styles.value, { fontSize: size * 0.24 }]}>{value}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  value: { color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] },
  label: { ...font.label, color: colors.textMuted, marginTop: 6 },
});
