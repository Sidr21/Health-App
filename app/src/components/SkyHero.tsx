/** Illustrated hero backdrop (sky gradient, stars or sun haze, layered mountain silhouettes), like Bevel's Sleep and Recovery headers. */
import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

type Variant = "night" | "day" | "golden" | "dusk";

const SKY: Record<Variant, { top: string; mid: string; bottom: string; far: string; near: string; sun?: string }> = {
  night: { top: "#1A1F55", mid: "#2A2F6E", bottom: "#141838", far: "#262C66", near: "#171B45" },
  day: { top: "#2E6E8E", mid: "#3B8F8A", bottom: "#163A3A", far: "#2A6A5E", near: "#1A4A43", sun: "#DDEBC8" },
  golden: { top: "#5A3A14", mid: "#8A5A1F", bottom: "#2A2110", far: "#6E4A1A", near: "#3E2A10", sun: "#FFD27A" },
  dusk: { top: "#4A1E2E", mid: "#7A2E3A", bottom: "#2A1216", far: "#5A2630", near: "#331418", sun: "#FF8A6B" },
};

const STARS = [
  [22, 40], [60, 18], [95, 70], [140, 30], [175, 55], [230, 22], [265, 64], [300, 36], [340, 80], [370, 28], [120, 110], [320, 120], [48, 130], [250, 125],
];

export function SkyHero({ variant = "night", height = 360 }: { variant?: Variant; height?: number }) {
  const c = SKY[variant];
  return (
    <Svg width="100%" height={height} viewBox="0 0 390 360" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={c.top} />
          <Stop offset="0.55" stopColor={c.mid} />
          <Stop offset="1" stopColor={c.bottom} />
        </LinearGradient>
        <RadialGradient id="haze" cx="50%" cy="48%" r="45%">
          <Stop offset="0" stopColor={c.sun ?? "#9FA8FF"} stopOpacity={variant === "night" ? 0.28 : 0.45} />
          <Stop offset="1" stopColor={c.sun ?? "#9FA8FF"} stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.6" stopColor={c.bottom} stopOpacity={0} />
          <Stop offset="1" stopColor={c.bottom} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={390} height={360} fill="url(#sky)" />
      <Rect x={0} y={0} width={390} height={360} fill="url(#haze)" />
      {variant === "night"
        ? STARS.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} fill="#FFFFFF" opacity={0.35 + (i % 4) * 0.15} />)
        : null}
      {/* far ridge */}
      <Path d="M0 250 L55 200 L95 230 L150 180 L200 225 L245 190 L300 235 L345 205 L390 240 L390 360 L0 360 Z" fill={c.far} opacity={0.9} />
      {/* near ridge */}
      <Path d="M0 300 L40 270 L90 300 L140 260 L190 300 L240 275 L290 310 L340 280 L390 305 L390 360 L0 360 Z" fill={c.near} />
      <Rect x={0} y={0} width={390} height={360} fill="url(#fade)" />
    </Svg>
  );
}
