import React from "react";
import Svg, { Path, Rect } from "react-native-svg";

interface Props {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
  /** Shaded "normal range" band */
  band?: { low: number; high: number } | null;
  bandColor?: string;
}

/** Tiny line chart with an optional normal-range band, as on Bevel's metric cards. */
export function Sparkline({ values, color, width = 110, height = 36, band, bandColor }: Props) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <Svg width={width} height={height} />;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys, band?.low ?? Infinity);
  const hi = Math.max(...ys, band?.high ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * width;
  const y = (v: number) => height - ((v - lo) / span) * (height - 4) - 2;
  const d = pts.map(([i, v], k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <Svg width={width} height={height}>
      {band ? (
        <Rect x={0} y={y(band.high)} width={width} height={Math.max(1, y(band.low) - y(band.high))} fill={bandColor ?? color} opacity={0.18} rx={3} />
      ) : null}
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
