/** Abstract aurora hero: deep sky, soft translucent light bands, a dark vignette behind the dial so numbers stay legible. */
import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

export type AuroraVariant = "night" | "mint" | "amber" | "red";

const PALETTES: Record<AuroraVariant, { sky: [string, string]; bands: [string, string, string]; stars: boolean }> = {
  night: { sky: ["#151B4D", "#0B0D1F"], bands: ["#5B6CFF", "#8C5CFF", "#2FB5FF"], stars: true },
  mint: { sky: ["#0D2626", "#0A0C11"], bands: ["#2EE6A6", "#3D8BFF", "#56E0FF"], stars: false },
  amber: { sky: ["#2A200E", "#0A0C11"], bands: ["#F7C948", "#FF8A3D", "#FFD27A"], stars: false },
  red: { sky: ["#2A1014", "#0A0C11"], bands: ["#FF5C5C", "#FF8A3D", "#C53DFF"], stars: false },
};

const STARS = [[22, 40], [60, 18], [95, 70], [140, 30], [175, 55], [230, 22], [265, 64], [300, 36], [340, 80], [370, 28], [120, 110], [320, 120], [48, 130], [250, 125], [205, 95], [12, 92]];

export function Aurora({ variant = "night", height = 360 }: { variant?: AuroraVariant; height?: number }) {
  const p = PALETTES[variant];
  const id = `au${variant}`;
  return (
    <Svg width="100%" height={height} viewBox="0 0 390 360" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id={`${id}sky`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={p.sky[0]} />
          <Stop offset="1" stopColor={p.sky[1]} />
        </LinearGradient>
        {p.bands.map((c, i) => (
          <LinearGradient key={i} id={`${id}b${i}`} x1="0" y1="0" x2="1" y2="0.6">
            <Stop offset="0" stopColor={c} stopOpacity={0} />
            <Stop offset="0.45" stopColor={c} stopOpacity={0.26} />
            <Stop offset="1" stopColor={c} stopOpacity={0} />
          </LinearGradient>
        ))}
        <RadialGradient id={`${id}vig`} cx="50%" cy="54%" r="34%">
          <Stop offset="0" stopColor={p.sky[1]} stopOpacity={0.75} />
          <Stop offset="1" stopColor={p.sky[1]} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id={`${id}fade`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.6" stopColor={p.sky[1]} stopOpacity={0} />
          <Stop offset="1" stopColor={p.sky[1]} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={390} height={360} fill={`url(#${id}sky)`} />
      {p.stars ? STARS.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.4 : 0.8} fill="#FFFFFF" opacity={0.2 + (i % 4) * 0.12} />) : null}
      <Path d="M-40 120 C 70 40, 170 190, 270 100 S 410 40, 430 120 L 430 210 C 330 170, 240 250, 140 200 S -10 150, -40 200 Z" fill={`url(#${id}b0)`} />
      <Path d="M-40 60 C 90 10, 190 130, 300 50 S 400 0, 430 60 L 430 120 C 320 100, 220 170, 120 130 S -10 90, -40 120 Z" fill={`url(#${id}b1)`} />
      <Path d="M-40 200 C 80 150, 200 260, 300 190 S 410 160, 430 210 L 430 280 C 300 250, 200 310, 90 270 S -20 250, -40 270 Z" fill={`url(#${id}b2)`} />
      <Rect x={0} y={0} width={390} height={360} fill={`url(#${id}vig)`} />
      <Rect x={0} y={0} width={390} height={360} fill={`url(#${id}fade)`} />
    </Svg>
  );
}
