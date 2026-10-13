import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Pattern, Rect, Stop } from "react-native-svg";

import { colors, font } from "@/theme/tokens";

interface Props {
  progress: number | null;
  label?: string;
  value: string;
  caption?: string;
  color: string;
  size?: number;
  stroke?: number;
  marker?: boolean;
  trackColor?: string;
  /** diagonal hatch fill like Bevel's Strain ring */
  hatched?: boolean;
  /** halo behind the ring (hero rings) */
  halo?: boolean;
}

/** Bevel ring: recessed track, gradient arc with a soft glow, 12 o'clock marker, optional hatch. */
export function Ring({ progress, label, value, caption, color, size = 96, stroke = 10, marker = true, trackColor, hatched, halo }: Props) {
  // keep the halo inside the canvas so it is not clipped into a square
  const r = (size - stroke) / 2 - (halo ? stroke * 1.3 : 2);
  const c = 2 * Math.PI * r;
  const p = progress == null ? 0 : Math.max(0.01, Math.min(1, progress));
  const id = `r${Math.round(size)}${color.replace("#", "")}${hatched ? "h" : ""}`;
  const arcStroke = hatched ? `url(#${id}p)` : `url(#${id}g)`;
  return (
    <View style={[styles.wrap, { width: size }]} accessibilityLabel={`${label ?? caption ?? ""} ${value}`}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0.6} />
          </LinearGradient>
          <Pattern id={`${id}p`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
            <Rect width={6} height={6} fill={color} opacity={0.35} />
            <Line x1={0} y1={0} x2={0} y2={6} stroke={color} strokeWidth={2.6} />
          </Pattern>
        </Defs>
        {halo ? (
          <>
            <Circle cx={size / 2} cy={size / 2} r={r + stroke * 1.15} fill="none" stroke={color} strokeWidth={stroke * 1.1} opacity={0.07} />
            <Circle cx={size / 2} cy={size / 2} r={r - stroke * 0.9} fill={color} opacity={0.06} />
          </>
        ) : null}
        {/* recessed track: dark base + faint inner edge */}
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? "rgba(0,0,0,0.35)"} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r + stroke / 2 - 0.5} stroke="rgba(255,255,255,0.06)" strokeWidth={1} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r - stroke / 2 + 0.5} stroke="rgba(255,255,255,0.04)" strokeWidth={1} fill="none" />
        {progress != null ? (
          <>
            {/* glow */}
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={color}
              strokeWidth={stroke * 1.9}
              strokeLinecap="round"
              fill="none"
              opacity={0.16}
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={c * (1 - p)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={arcStroke}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${c} ${c}`}
              strokeDashoffset={c * (1 - p)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </>
        ) : null}
        {marker ? (
          <>
            <Circle cx={size / 2} cy={size / 2 - r} r={stroke * 0.5} fill={progress == null ? colors.textFaint : color} opacity={0.25} />
            <Circle cx={size / 2} cy={size / 2 - r} r={stroke * 0.3} fill={progress == null ? colors.textFaint : color} />
          </>
        ) : null}
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
