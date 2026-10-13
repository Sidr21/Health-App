import React from "react";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

interface Props {
  values: (number | null)[];
  color: string;
  width?: number;
  height?: number;
  band?: { low: number; high: number } | null;
  bandColor?: string;
}

let uid = 0;

/** Bevel trend sparkline: gradient stroke, faint area fill, normal-range band and a glowing end dot. */
export function Sparkline({ values, color, width = 120, height = 44, band, bandColor }: Props) {
  const id = React.useMemo(() => `sp${++uid}`, []);
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <Svg width={width} height={height} />;
  const ys = pts.map((p) => p[1]);
  const lo = Math.min(...ys, band?.low ?? Infinity);
  const hi = Math.max(...ys, band?.high ?? -Infinity);
  const span = hi - lo || 1;
  const pad = 5;
  const x = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - 2 * pad);
  const y = (v: number) => height - pad - ((v - lo) / span) * (height - 2 * pad);
  const d = pts.map(([i, v], k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const first = pts[0];
  const last = pts[pts.length - 1];
  const area = `${d} L${x(last[0]).toFixed(1)} ${height} L${x(first[0]).toFixed(1)} ${height} Z`;
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={color} stopOpacity={0.55} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
        <LinearGradient id={`${id}a`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {band ? (
        <Rect x={0} y={y(band.high)} width={width} height={Math.max(2, y(band.low) - y(band.high))} fill={bandColor ?? color} opacity={0.14} rx={4} />
      ) : null}
      <Path d={area} fill={`url(#${id}a)`} />
      <Path d={d} stroke={`url(#${id}l)`} strokeWidth={2.2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      <Circle cx={x(last[0])} cy={y(last[1])} r={6} fill={color} opacity={0.25} />
      <Circle cx={x(last[0])} cy={y(last[1])} r={3.2} fill={color} />
    </Svg>
  );
}
