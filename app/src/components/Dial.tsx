/** Open 270° dial: faint track, gradient arc with glow and a bright tip, condensed numeral inside, uppercase label below. */
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Pattern, Rect, Stop } from "react-native-svg";

import { colors, font, fonts } from "@/theme/tokens";

interface Props {
  progress: number | null;
  value: string;
  label?: string;
  caption?: string;
  color: string;
  size?: number;
  stroke?: number;
  hatched?: boolean;
  trackColor?: string;
}

const A0 = 135;
const A1 = 405; // 270° sweep, open at the bottom

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

let uid = 0;

export function Dial({ progress, value, label, caption, color, size = 104, stroke = 8, hatched, trackColor }: Props) {
  const id = React.useMemo(() => `dial${++uid}`, []);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2 - stroke * 0.9; // room for the glow
  const p = progress == null ? null : Math.max(0.015, Math.min(1, progress));
  const end = p == null ? null : A0 + p * (A1 - A0);
  const tip = end == null ? null : polar(cx, cy, r, end);
  const numSize = size * 0.27;
  const hasPct = value.endsWith("%");
  return (
    <View style={[styles.wrap, { width: size }]} accessibilityLabel={`${label ?? caption ?? ""} ${value}`}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={`${id}g`} x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0.5} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
          <Pattern id={`${id}p`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
            <Rect width={6} height={6} fill={color} opacity={0.3} />
            <Rect x={0} y={0} width={2.4} height={6} fill={color} />
          </Pattern>
        </Defs>
        <Path d={arc(cx, cy, r, A0, A1)} stroke={trackColor ?? "rgba(255,255,255,0.07)"} strokeWidth={stroke} fill="none" strokeLinecap="round" />
        {end != null ? (
          <>
            <Path d={arc(cx, cy, r, A0, end)} stroke={color} strokeWidth={stroke * 2.4} fill="none" strokeLinecap="round" opacity={0.13} />
            <Path d={arc(cx, cy, r, A0, end)} stroke={hatched ? `url(#${id}p)` : `url(#${id}g)`} strokeWidth={stroke} fill="none" strokeLinecap="round" />
            {tip ? <Circle cx={tip.x} cy={tip.y} r={stroke * 0.36} fill="#FFFFFF" opacity={0.95} /> : null}
          </>
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center, { height: size }]}>
        <Text style={[styles.value, { fontSize: numSize, lineHeight: numSize * 1.05 }]}>
          {hasPct ? value.slice(0, -1) : value}
          {hasPct ? <Text style={{ fontSize: numSize * 0.5, color: colors.textMuted }}>%</Text> : null}
        </Text>
        {caption ? <Text style={[styles.caption, { fontSize: Math.max(10, size * 0.065) }]}>{caption}</Text> : null}
      </View>
      {label ? <Text style={[styles.label, { marginTop: -size * 0.1 }]}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  center: { alignItems: "center", justifyContent: "center" },
  value: { color: colors.text, fontFamily: fonts.numeral, fontVariant: ["tabular-nums"] },
  caption: { ...font.overline, color: colors.textMuted, marginTop: 2 },
  label: { ...font.overline, color: colors.textMuted },
});
