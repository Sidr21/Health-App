/** Charts for workout, sleep and body screens. Plain react-native-svg, measured to their container. */
import React, { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, Line, LinearGradient, Path, Rect, Stop, Circle } from "react-native-svg";

import type { SleepSegmentOut, SleepStage, ZoneOut } from "@/lib/api";
import { clockDuration } from "@/lib/units";
import { colors, font, fonts } from "@/theme/tokens";

function useWidth(initial = 320): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

// ---------------------------------------------------------------- line chart

export interface Band {
  lo: number;
  hi: number;
  color: string;
}

export function LineChart({
  points,
  color,
  height = 150,
  bands,
  xLabels,
  yFormat = (v) => String(Math.round(v)),
  marker,
  dots = false,
  step = false,
  id = "lc",
}: {
  points: { x: number; y: number | null }[];
  color: string;
  height?: number;
  bands?: Band[];
  xLabels?: [string, string];
  yFormat?: (v: number) => string;
  marker?: { x: number; label: string } | null;
  dots?: boolean;
  /** draw as steps (lap averages) rather than a smooth line */
  step?: boolean;
  id?: string;
}) {
  const [w, onLayout] = useWidth();
  const ys = points.map((p) => p.y).filter((v): v is number => v != null);
  if (!ys.length) return <View style={{ height }} />;
  const left = 34;
  const top = 8;
  const bottom = 18;
  const plotW = Math.max(10, w - left - 4);
  const plotH = height - top - bottom;
  let lo = Math.min(...ys);
  let hi = Math.max(...ys);
  const pad = Math.max(1, (hi - lo) * 0.12);
  lo -= pad;
  hi += pad;
  const xs = points.map((p) => p.x);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  // a single reading sits in the middle instead of hugging the y axis
  const X = (x: number) => (x1 === x0 ? left + plotW / 2 : left + ((x - x0) / (x1 - x0)) * plotW);
  const Y = (y: number) => top + (1 - (y - lo) / (hi - lo || 1)) * plotH;

  let d = "";
  let pen = false;
  let lastY = 0;
  for (const p of points) {
    if (p.y == null) {
      pen = false;
      continue;
    }
    if (!pen) d += `M${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`;
    else if (step) d += `L${X(p.x).toFixed(1)} ${Y(lastY).toFixed(1)}L${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`;
    else d += `L${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`;
    pen = true;
    lastY = p.y;
  }
  const firstX = X(points.find((p) => p.y != null)!.x);
  const lastPt = [...points].reverse().find((p) => p.y != null)!;
  const area = `${d}L${X(lastPt.x).toFixed(1)} ${top + plotH}L${firstX.toFixed(1)} ${top + plotH}Z`;
  const ticks = [hi - pad, (hi + lo) / 2, lo + pad];

  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={w} height={height}>
        <Defs>
          <LinearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.32} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {(bands ?? []).map((b, i) => {
          const y1 = Y(Math.min(hi, b.hi));
          const y2 = Y(Math.max(lo, b.lo));
          if (y2 <= y1) return null;
          return <Rect key={i} x={left} y={y1} width={plotW} height={y2 - y1} fill={b.color} opacity={0.08} />;
        })}
        {ticks.map((t, i) => (
          <Line key={i} x1={left} x2={left + plotW} y1={Y(t)} y2={Y(t)} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
        ))}
        <Path d={area} fill={`url(#${id}-fill)`} />
        <Path d={d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
        {dots
          ? points.map((p, i) => (p.y != null ? <Circle key={i} cx={X(p.x)} cy={Y(p.y)} r={3.2} fill={color} /> : null))
          : null}
        {marker ? <Line x1={X(marker.x)} x2={X(marker.x)} y1={top} y2={top + plotH} stroke={colors.text} strokeOpacity={0.5} strokeDasharray="2 3" /> : null}
      </Svg>
      {ticks.map((t, i) => (
        <Text key={i} style={[styles.yLabel, { top: Y(t) - 7 }]}>{yFormat(t)}</Text>
      ))}
      {xLabels ? (
        <View style={[styles.xRow, { left }]}>
          <Text style={styles.axis}>{xLabels[0]}</Text>
          <Text style={styles.axis}>{xLabels[1]}</Text>
        </View>
      ) : null}
      {marker ? <Text style={[styles.marker, { left: Math.min(w - 90, Math.max(left, X(marker.x) + 4)) }]}>{marker.label}</Text> : null}
    </View>
  );
}

// ---------------------------------------------------------------- HR zones

export const ZONE_COLORS = ["#7C8AA5", "#2EE6A6", "#F7C948", "#FF8A3D", "#FF5C5C"];

export function ZoneBars({ zones }: { zones: ZoneOut[] }) {
  const total = zones.reduce((s, z) => s + z.seconds, 0) || 1;
  const max = Math.max(...zones.map((z) => z.seconds), 1);
  return (
    <View style={{ gap: 9 }}>
      {[...zones].reverse().map((z) => {
        const pct = (100 * z.seconds) / total;
        const range = z.lo_bpm == null ? `< ${(z.hi_bpm ?? 0) + 1}` : z.hi_bpm == null ? `≥ ${z.lo_bpm}` : `${z.lo_bpm}–${z.hi_bpm}`;
        return (
          <View key={z.zone} style={styles.zoneRow}>
            <View style={[styles.zoneTag, { backgroundColor: `${ZONE_COLORS[z.zone - 1]}26` }]}>
              <Text style={[styles.zoneTagText, { color: ZONE_COLORS[z.zone - 1] }]}>Z{z.zone}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.zoneTrack}>
                <View style={[styles.zoneFill, { width: `${Math.max(z.seconds ? 2 : 0, (100 * z.seconds) / max)}%`, backgroundColor: ZONE_COLORS[z.zone - 1] }]} />
              </View>
              <Text style={styles.zoneSub}>{z.name} · {range} bpm</Text>
            </View>
            <View style={{ alignItems: "flex-end", width: 64 }}>
              <Text style={styles.zonePct}>{Math.round(pct)}%</Text>
              <Text style={styles.zoneSub}>{clockDuration(z.seconds)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function FocusBar({ focus }: { focus: { low_aerobic: number; high_aerobic: number; anaerobic: number } }) {
  const parts = [
    { k: "Low aerobic", v: focus.low_aerobic, c: ZONE_COLORS[1] },
    { k: "High aerobic", v: focus.high_aerobic, c: ZONE_COLORS[3] },
    { k: "Anaerobic", v: focus.anaerobic, c: ZONE_COLORS[4] },
  ];
  return (
    <View>
      <View style={styles.focusBar}>
        {parts.map((p) => (p.v > 0 ? <View key={p.k} style={{ flex: p.v, backgroundColor: p.c }} /> : null))}
      </View>
      <View style={styles.focusLegend}>
        {parts.map((p) => (
          <View key={p.k} style={{ flex: 1 }}>
            <Text style={[styles.focusPct, { color: p.c }]}>{Math.round(p.v)}%</Text>
            <Text style={styles.zoneSub}>{p.k}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------- sleep

export const STAGE_COLORS: Record<SleepStage, string> = {
  awake: colors.sleepAwake,
  rem: colors.sleepRem,
  light: colors.sleep,
  asleep: colors.sleep,
  deep: colors.sleepDeep,
};
const STAGE_ROWS: SleepStage[] = ["awake", "rem", "light", "deep"];
const STAGE_LABEL: Record<SleepStage, string> = { awake: "Awake", rem: "REM", light: "Light", asleep: "Asleep", deep: "Deep" };

export function Hypnogram({ segments, height = 170 }: { segments: SleepSegmentOut[]; height?: number }) {
  const [w, onLayout] = useWidth();
  if (!segments.length) return null;
  const left = 50;
  const plotW = Math.max(10, w - left);
  const t0 = new Date(segments[0].start).getTime();
  const t1 = Math.max(...segments.map((s) => new Date(s.end).getTime()));
  const rowH = (height - 22) / STAGE_ROWS.length;
  const X = (t: number) => left + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const rowOf = (s: SleepStage) => STAGE_ROWS.indexOf(s === "asleep" ? "light" : s);
  const hours: number[] = [];
  const firstHour = new Date(t0);
  firstHour.setMinutes(0, 0, 0);
  for (let t = firstHour.getTime() + 3600_000; t < t1; t += 3600_000 * 2) hours.push(t);
  return (
    <View onLayout={onLayout} style={{ height }}>
      <Svg width={w} height={height}>
        {STAGE_ROWS.map((s, i) => (
          <Line key={s} x1={left} x2={left + plotW} y1={i * rowH + rowH / 2} y2={i * rowH + rowH / 2} stroke="rgba(255,255,255,0.05)" />
        ))}
        {segments.map((s, i) => {
          const next = segments[i + 1];
          const r = rowOf(s.stage);
          const x1 = X(new Date(s.start).getTime());
          const x2 = X(new Date(s.end).getTime());
          const y = r * rowH + rowH * 0.18;
          return (
            <React.Fragment key={i}>
              <Rect x={x1} y={y} width={Math.max(1.5, x2 - x1)} height={rowH * 0.64} rx={3} fill={STAGE_COLORS[s.stage]} />
              {next ? (
                <Line
                  x1={x2}
                  x2={x2}
                  y1={y + rowH * 0.32}
                  y2={rowOf(next.stage) * rowH + rowH * 0.5}
                  stroke={STAGE_COLORS[s.stage]}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              ) : null}
            </React.Fragment>
          );
        })}
      </Svg>
      {STAGE_ROWS.map((s, i) => (
        <Text key={s} style={[styles.stageLabel, { top: i * rowH + rowH / 2 - 8, color: STAGE_COLORS[s] }]}>{STAGE_LABEL[s]}</Text>
      ))}
      <View style={[styles.xRow, { left }]}>
        <Text style={styles.axis}>{new Date(t0).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
        {hours.slice(0, 3).map((t) => (
          <Text key={t} style={styles.axis}>{new Date(t).toLocaleTimeString(undefined, { hour: "numeric" })}</Text>
        ))}
        <Text style={styles.axis}>{new Date(t1).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text>
      </View>
    </View>
  );
}

/** Stage composition when there is no timeline (COROS gives totals only). */
export function StageBar({ parts }: { parts: { stage: SleepStage; seconds: number | null; typical?: string }[] }) {
  const total = parts.reduce((s, p) => s + (p.seconds ?? 0), 0) || 1;
  return (
    <View>
      <View style={styles.stageBar}>
        {parts.map((p) => (p.seconds ? <View key={p.stage} style={{ flex: p.seconds, backgroundColor: STAGE_COLORS[p.stage] }} /> : null))}
      </View>
      <View style={{ gap: 10, marginTop: 14 }}>
        {parts.map((p) => (
          <View key={p.stage} style={styles.stageRow}>
            <View style={[styles.dot, { backgroundColor: STAGE_COLORS[p.stage] }]} />
            <Text style={styles.stageName}>{STAGE_LABEL[p.stage]}</Text>
            {p.typical ? <Text style={styles.zoneSub}>typical {p.typical}</Text> : null}
            <View style={{ flex: 1 }} />
            <Text style={styles.stageVal}>{p.seconds != null ? `${Math.floor(p.seconds / 3600)}h ${String(Math.round((p.seconds % 3600) / 60)).padStart(2, "0")}m` : "–"}</Text>
            <Text style={[styles.stagePct, { color: STAGE_COLORS[p.stage] }]}>{p.seconds != null ? `${Math.round((100 * p.seconds) / total)}%` : ""}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  yLabel: { position: "absolute", left: 0, width: 30, textAlign: "right", fontFamily: fonts.numeral, fontSize: 11, color: colors.textFaint },
  xRow: { position: "absolute", right: 0, bottom: 0, flexDirection: "row", justifyContent: "space-between" },
  axis: { fontFamily: fonts.numeral, fontSize: 11, color: colors.textFaint },
  marker: { position: "absolute", top: 4, fontFamily: fonts.label, fontSize: 11, color: colors.text },
  zoneRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  zoneTag: { width: 34, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  zoneTagText: { fontFamily: fonts.numeralBold, fontSize: 13 },
  zoneTrack: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  zoneFill: { height: 8, borderRadius: 4 },
  zoneSub: { ...font.caption, color: colors.textFaint, marginTop: 3 },
  zonePct: { fontFamily: fonts.numeral, fontSize: 16, color: colors.text },
  focusBar: { flexDirection: "row", height: 12, borderRadius: 6, overflow: "hidden", gap: 2 },
  focusLegend: { flexDirection: "row", marginTop: 10 },
  focusPct: { fontFamily: fonts.numeral, fontSize: 20 },
  stageLabel: { position: "absolute", left: 0, ...font.overline, fontSize: 10 },
  stageBar: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden", gap: 2 },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  stageName: { ...font.label, color: colors.text, width: 50 },
  stageVal: { fontFamily: fonts.numeral, fontSize: 15, color: colors.text },
  stagePct: { fontFamily: fonts.numeral, fontSize: 13, width: 38, textAlign: "right" },
});
