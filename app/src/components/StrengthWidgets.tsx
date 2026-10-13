/** Strength section building blocks: stat cards, freshness card, muscle rows, session cards. */
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { BodyMap, FOCUS } from "@/components/BodyMap";
import { ArrowRight, DumbbellIcon } from "@/components/icons";
import { Surface } from "@/components/Surface";
import type { MuscleStateOut, StrengthSession, StrengthSummary } from "@/lib/api";
import { fillsFor, relativeDay, statusColor, statusLabel, weight, type MapMode } from "@/lib/strength";
import { colors, font, fonts, spacing } from "@/theme/tokens";

/** Ten pips; lit pips = freshness, the last lit one is brighter (Whoop-style segmented meter). */
export function Pips({ value, color, n = 10, width = 120 }: { value: number; color: string; n?: number; width?: number }) {
  const lit = Math.max(0, Math.min(n, Math.round((value / 100) * n)));
  const gap = 3;
  const w = (width - gap * (n - 1)) / n;
  return (
    <Svg width={width} height={8}>
      {Array.from({ length: n }, (_, i) => (
        <Rect
          key={i}
          x={i * (w + gap)}
          y={0}
          width={w}
          height={8}
          rx={3}
          fill={i < lit ? color : "rgba(255,255,255,0.08)"}
          opacity={i < lit ? (i === lit - 1 ? 1 : 0.45) : 1}
        />
      ))}
    </Svg>
  );
}

/** Seven mini bars, today on the right. */
function WeekBars({ values, color, width = 120, height = 34 }: { values: number[]; color: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const gap = 5;
  const w = (width - gap * (values.length - 1)) / values.length;
  return (
    <Svg width={width} height={height}>
      {values.map((v, i) => {
        const h = v > 0 ? Math.max(4, (v / max) * height) : 3;
        return (
          <Rect
            key={i}
            x={i * (w + gap)}
            y={height - h}
            width={w}
            height={h}
            rx={2.5}
            fill={v > 0 ? color : "rgba(255,255,255,0.08)"}
            opacity={v > 0 ? (i === values.length - 1 ? 1 : 0.6) : 1}
          />
        );
      })}
    </Svg>
  );
}

function Delta({ now, prev, format }: { now: number; prev: number; format: (v: number) => string }) {
  if (!now && !prev) return <Text style={styles.deltaFlat}>No lifting this week</Text>;
  const diff = now - prev;
  if (Math.abs(diff) < 1e-6) return <Text style={styles.deltaFlat}>Same as last week</Text>;
  const up = diff > 0;
  return (
    <Text style={[styles.delta, { color: up ? colors.recovery : colors.textMuted }]}>
      {up ? "▲" : "▼"} {format(Math.abs(diff))} vs last week
    </Text>
  );
}

export function StrengthStatCards({ s }: { s: StrengthSummary }) {
  const t = s.totals;
  return (
    <View style={styles.row}>
      <Surface style={styles.stat} onPress={() => router.push({ pathname: "/muscles", params: { mode: "volume" } })}>
        <Text style={styles.overline}>Sets · 7 days</Text>
        <Text style={styles.big}>{t.sets_7d}</Text>
        <Delta now={t.sets_7d} prev={t.sets_prev_7d} format={(v) => `${v}`} />
        <View style={styles.bars}>
          <WeekBars values={s.daily.map((d) => d.sets)} color={colors.muscular} />
        </View>
      </Surface>
      <Surface style={styles.stat} onPress={() => router.push({ pathname: "/muscles", params: { mode: "volume" } })}>
        <Text style={styles.overline}>Volume · 7 days</Text>
        <Text style={styles.big} numberOfLines={1} adjustsFontSizeToFit>
          {weight(t.volume_7d_kg).replace(/ (lb|kg)$/, "")}
          <Text style={styles.unit}> {weight(1).split(" ")[1]}</Text>
        </Text>
        <Delta now={t.volume_7d_kg} prev={t.volume_prev_7d_kg} format={(v) => weight(v)} />
        <View style={styles.bars}>
          <WeekBars values={s.daily.map((d) => d.volume_kg)} color={colors.sleep} />
        </View>
      </Surface>
    </View>
  );
}

export function MuscleThumb({ m, mode = "freshness", size = 44 }: { m: MuscleStateOut; mode?: MapMode; size?: number }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: size / 3 }]}>
      <BodyMap side={FOCUS[m.id].side} focus={m.id} fills={fillsFor([m], mode)} width={size - 6} />
    </View>
  );
}

/** Freshness overview: both body views, a one-line summary and the most fatigued muscles. */
export function FreshnessCard({ s }: { s: StrengthSummary }) {
  const fills = fillsFor(s.muscles, "freshness");
  const tired = [...s.muscles].sort((a, b) => a.freshness - b.freshness);
  const fatigued = s.muscles.filter((m) => m.status === "fatigued").length;
  const depleted = s.muscles.filter((m) => m.status === "depleted").length;
  const summary =
    fatigued + depleted === 0
      ? "Every muscle group is recovered"
      : [depleted ? `${depleted} depleted` : null, fatigued ? `${fatigued} fatigued` : null].filter(Boolean).join(" · ");
  return (
    <Surface style={styles.card} onPress={() => router.push("/muscles")}>
      <View style={styles.headRow}>
        <Text style={styles.overline}>Muscle freshness</Text>
        <ArrowRight size={16} color={colors.textMuted} />
      </View>
      <View style={styles.freshTop}>
        <View style={styles.maps}>
          <BodyMap side="front" fills={fills} width={62} />
          <BodyMap side="back" fills={fills} width={62} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summary}>{summary}</Text>
          <Text style={styles.caption}>Workouts decay over 2–3 days. Running and riding load your legs too.</Text>
        </View>
      </View>
      <View style={styles.grid}>
        {tired.slice(0, 6).map((m) => (
          <View key={m.id} style={styles.cell}>
            <MuscleThumb m={m} size={40} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.cellName}>{m.name}</Text>
              <Text style={[styles.cellPct, { color: m.freshness < 99 ? statusColor[m.status] : colors.textMuted }]}>
                {Math.round(m.freshness)}%
              </Text>
              <Pips value={m.freshness} color={statusColor[m.status]} width={92} />
            </View>
          </View>
        ))}
      </View>
    </Surface>
  );
}

const SOURCE: Record<StrengthSession["source"], string> = { coros: "COROS", strong: "Strong", hevy: "Hevy", manual: "Logged" };

export function SessionCard({ x }: { x: StrengthSession }) {
  const when = new Date(x.start);
  const label = when.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  const top = x.exercises.slice(0, 3);
  return (
    <Surface style={styles.card}>
      <View style={styles.sessRow}>
        <View style={styles.sessIcon}><DumbbellIcon size={18} color={colors.muscular} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sessName}>{x.name || "Strength"}</Text>
          <Text style={styles.caption}>{label} · {SOURCE[x.source]}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.sessNum}>{x.sets}<Text style={styles.unit}> sets</Text></Text>
          {x.volume_kg > 0 ? <Text style={styles.caption}>{weight(x.volume_kg)}</Text> : null}
        </View>
      </View>
      {top.map((e) => (
        <View key={e.name} style={styles.exRow}>
          <Text style={styles.exName} numberOfLines={1}>{e.name}</Text>
          <Text style={styles.exVal}>
            {e.sets} × {e.best_weight_kg ? `${e.best_reps ?? "–"} @ ${weight(e.best_weight_kg)}` : `${e.best_reps ?? "–"} reps`}
          </Text>
        </View>
      ))}
      {x.exercises.length > 3 ? <Text style={styles.caption}>+{x.exercises.length - 3} more</Text> : null}
    </Surface>
  );
}

export function MuscleRow({ m, mode, max }: { m: MuscleStateOut; mode: MapMode; max: number }) {
  const value =
    mode === "freshness" ? `${Math.round(m.freshness)}%` : mode === "load" ? m.load_7d.toFixed(1) : m.volume_7d_kg > 0 ? weight(m.volume_7d_kg) : `${m.sets_7d} sets`;
  const sub = mode === "freshness" ? `${statusLabel[m.status]} · ${m.last_trained ? `trained ${relativeDay(m.last_trained)}` : relativeDay(null)}` : mode === "load" ? describeSources(m) : `${m.sets_7d} sets credited`;
  const barValue = mode === "freshness" ? m.freshness : max > 0 ? (100 * (mode === "load" ? m.load_7d : m.volume_7d_kg || m.sets_7d)) / max : 0;
  const color = mode === "freshness" ? statusColor[m.status] : mode === "load" ? colors.strain : colors.muscular;
  return (
    <Surface style={styles.muscleRow}>
      <MuscleThumb m={m} mode={mode} size={48} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.cellName}>{m.name}</Text>
        <Text style={[styles.caption, mode === "freshness" && m.freshness < 99 ? { color } : null]}>{sub}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={styles.rowVal}>{value}</Text>
        <Pips value={barValue} color={color} width={72} />
      </View>
    </Surface>
  );
}

function describeSources(m: MuscleStateOut): string {
  const st = m.sources.strength ?? 0;
  const ca = m.sources.cardio ?? 0;
  if (!st && !ca) return "No load this week";
  if (st && ca) return `Lifting ${Math.round((100 * st) / (st + ca))}% · cardio ${Math.round((100 * ca) / (st + ca))}%`;
  return st ? "All from lifting" : "All from cardio";
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10, marginBottom: spacing.md },
  stat: { flex: 1, minHeight: 150 },
  overline: { ...font.overline, fontSize: 11, color: colors.textMuted },
  big: { ...font.number, fontSize: 32, color: colors.text, marginTop: 6 },
  unit: { fontSize: 13, fontFamily: fonts.label, color: colors.textMuted },
  delta: { fontFamily: fonts.label, fontSize: 12, marginTop: 2 },
  deltaFlat: { fontFamily: fonts.label, fontSize: 12, color: colors.textFaint, marginTop: 2 },
  bars: { marginTop: "auto", paddingTop: 12 },
  card: { marginBottom: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  freshTop: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 10, marginBottom: 6 },
  maps: { flexDirection: "row", gap: 2 },
  summary: { ...font.heading, fontSize: 16, color: colors.text },
  caption: { ...font.caption, color: colors.textMuted },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 10, rowGap: 14 },
  cell: { width: "48%", flexDirection: "row", alignItems: "center", gap: 10 },
  cellName: { ...font.heading, fontSize: 14, color: colors.text },
  cellPct: { fontFamily: fonts.numeral, fontSize: 13 },
  thumb: { backgroundColor: "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  sessRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  sessIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: `${colors.muscular}1F`, alignItems: "center", justifyContent: "center" },
  sessName: { ...font.heading, fontSize: 15, color: colors.text },
  sessNum: { ...font.number, fontSize: 20, color: colors.text },
  exRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  exName: { ...font.label, color: colors.textMuted, flex: 1, marginRight: 8 },
  exVal: { fontFamily: fonts.numeral, fontSize: 14, color: colors.text },
  muscleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8, paddingVertical: 10 },
  rowVal: { fontFamily: fonts.numeral, fontSize: 18, color: colors.text },
});
