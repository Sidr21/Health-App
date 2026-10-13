import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { colors, font, spacing } from "@/theme/tokens";

interface Props {
  title: string;
  value: number | null;
  min: number;
  max: number;
  optimal: [number, number];
  status?: string | null;
  color: string;
  size?: number;
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const s = polar(cx, cy, r, a0);
  const e = polar(cx, cy, r, a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

/** Bevel's training-load arc gauge: tick marks, an "optimal" band, a marker dot, status word. */
export function Gauge({ title, value, min, max, optimal, status, color, size = 150 }: Props) {
  const cx = size / 2;
  const cy = size * 0.56;
  const r = size * 0.4;
  const A0 = -210;
  const A1 = 30;
  const toA = (v: number) => A0 + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (A1 - A0);
  const ticks = Array.from({ length: 41 }, (_, i) => A0 + (i / 40) * (A1 - A0));
  const vA = value == null ? null : toA(value);
  const mark = vA == null ? null : polar(cx, cy, r, vA);
  return (
    <View style={[styles.card, { width: "48%" }]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={[styles.status, { color }]}>{status ?? "–"}</Text>
      <Svg width={size} height={size * 0.78} style={{ alignSelf: "center" }}>
        {ticks.map((a, i) => {
          const o = polar(cx, cy, r + 8, a);
          const inn = polar(cx, cy, r + 2, a);
          const inOpt = a >= toA(optimal[0]) && a <= toA(optimal[1]);
          const lit = vA != null && a <= vA;
          return <Line key={i} x1={inn.x} y1={inn.y} x2={o.x} y2={o.y} stroke={lit ? color : inOpt ? colors.hairline : colors.ring} strokeWidth={2} strokeLinecap="round" />;
        })}
        <Path d={arc(cx, cy, r + 14, toA(optimal[0]), toA(optimal[1]))} stroke={colors.recovery} strokeWidth={3} fill="none" strokeLinecap="round" />
        {mark ? <Circle cx={mark.x} cy={mark.y} r={7} fill={color} stroke={colors.card} strokeWidth={3} /> : null}
      </Svg>
      <Text style={styles.value}>{value == null ? "–" : Math.round(value)}</Text>
      <View style={styles.range}>
        <Text style={styles.rangeText}>{min}</Text>
        <Text style={styles.rangeText}>{max}</Text>
      </View>
      <Text style={styles.optimal}>
        Optimal: <Text style={{ color: colors.text }}>{optimal[0]} – {optimal[1]}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 26, padding: spacing.lg, marginBottom: spacing.md },
  title: { ...font.label, color: colors.textMuted },
  status: { ...font.heading, marginTop: 2 },
  value: { ...font.number, color: colors.text, textAlign: "center", marginTop: -34 },
  range: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10, marginTop: 6 },
  rangeText: { ...font.caption, color: colors.textFaint },
  optimal: { ...font.caption, color: colors.textMuted, marginTop: 8 },
});
