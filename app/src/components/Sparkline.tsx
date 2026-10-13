import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";

interface Props {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
  band?: { low: number; high: number } | null;
  bandColor?: string;
}

/** Tiny line chart with a normal-range band and an end marker, as on Bevel's metric cards. */
export function Sparkline({ values, color, width = 120, height = 44, band, bandColor }: Props) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <Svg width={width} height={height} />;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys, band?.low ?? Infinity);
  const hi = Math.max(...ys, band?.high ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 4;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - 2 * pad);
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - 2 * pad);
  const d = pts.map(([i, v], k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      {band ? (
        <Rect x={0} y={y(band.high)} width={width} height={Math.max(2, y(band.low) - y(band.high))} fill={bandColor ?? color} opacity={0.16} rx={4} />
      ) : null}
      <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(last[0])} cy={y(last[1])} r={3.2} fill={color} />
    </Svg>
  );
}
