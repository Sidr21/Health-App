import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Stop } from "react-native-svg";

import { colors, font } from "@/theme/tokens";

interface Props {
  progress: number | null;
  label?: string;
  value: string;
  /** small text under the value, inside the ring (e.g. "Quality", "Strain") */
  caption?: string;
  color: string;
  size?: number;
  stroke?: number;
  /** dot at 12 o'clock like Bevel's rings */
  marker?: boolean;
  trackColor?: string;
}

/** Ring with the value inside, optional 12 o'clock marker and label below, as on Bevel's Home. */
export function Ring({ progress, label, value, caption, color, size = 96, stroke = 10, marker = true, trackColor }: Props) {
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const p = progress == null ? 0 : Math.max(0.01, Math.min(1, progress));
  const id = `g${Math.round(size)}${color.replace("#", "")}`;
  return (
    <View style={[styles.wrap, { width: size }]} accessibilityLabel={`${label ?? caption ?? ""} ${value}`}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? colors.ring} strokeWidth={stroke} fill="none" />
        {progress != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
        {marker ? <Circle cx={size / 2} cy={stroke / 2 + 2} r={stroke * 0.32} fill={progress == null ? colors.textFaint : color} /> : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center, { height: size }]}>
        <Text style={[styles.value, { fontSize: size * 0.21 }]}>
          {value.replace("%", "")}
          {value.endsWith("%") ? <Text style={{ fontSize: size * 0.13, fontWeight: "600" }}>%</Text> : null}
        </Text>
        {caption ? <Text style={[styles.caption, { fontSize: Math.max(10, size * 0.085) }]}>{caption}</Text> : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  value: { color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"], letterSpacing: -0.5 },
  caption: { color: colors.textMuted, fontWeight: "500", marginTop: -2 },
  label: { ...font.label, fontSize: 14, color: colors.text, marginTop: 8 },
});
