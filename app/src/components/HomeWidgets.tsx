/** Bevel Home building blocks: stress card, energy bar, health-monitor tile, timeline card. */
import { router } from "expo-router";
import React, { type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { ArrowRight, BedIcon, BoltIcon, CheckCircle, MoonIcon, type IconProps } from "@/components/icons";
import { Surface, type SurfaceTone } from "@/components/Surface";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** Small circular gauge with a green→red arc, like the one on Bevel's stress card. */
export function StressGauge({ value, size = 88 }: { value: number | null; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.4;
  const A0 = 135;
  const A1 = 405;
  const ticks = Array.from({ length: 36 }, (_, i) => A0 + (i / 35) * (A1 - A0));
  const vA = value == null ? null : A0 + (Math.max(0, Math.min(100, value)) / 100) * (A1 - A0);
  const m = vA == null ? null : polar(cx, cy, r, vA);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="stressg" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#3DD68C" />
            <Stop offset="0.5" stopColor="#F5C542" />
            <Stop offset="1" stopColor="#FF453A" />
          </LinearGradient>
          <RadialGradient id="stressdisc" cx="35%" cy="30%" r="80%">
            <Stop offset="0" stopColor="#2A2F3B" />
            <Stop offset="1" stopColor="#13161D" />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r - 6} fill="url(#stressdisc)" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {ticks.map((a, i) => {
          const o = polar(cx, cy, r + 4, a);
          const inn = polar(cx, cy, r - 1, a);
          const lit = vA != null && a <= vA;
          return <Path key={i} d={`M${inn.x} ${inn.y} L${o.x} ${o.y}`} stroke={lit ? "url(#stressg)" : "rgba(255,255,255,0.10)"} strokeWidth={2.2} strokeLinecap="round" opacity={lit ? 1 : 1} />;
        })}
        {m ? <Circle cx={m.x} cy={m.y} r={3.5} fill={colors.text} /> : null}
      </Svg>
      <Text style={[StyleSheet.absoluteFill, styles.gaugeValue, { lineHeight: size }]}>{value == null ? "–" : Math.round(value)}</Text>
    </View>
  );
}

export function StressCard({ avg, min, max, updated, onPress }: { avg: number | null; min: number | null; max: number | null; updated: string | null; onPress?: () => void }) {
  const stamp = updated ? new Date(updated).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : null;
  const cell = (label: string, v: number | null) => (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{v == null ? "–" : v}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
  return (
    <Surface onPress={onPress} style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={{ flex: 1 }}>
          <View style={styles.rowCenter}>
            <View style={[styles.dot, { backgroundColor: colors.recovery }]} />
            <Text style={styles.cardTitle}>Today&apos;s stress</Text>
          </View>
          <Text style={styles.cardSub}>{stamp ? `Last updated at ${stamp}` : avg != null ? "Daily average from COROS" : "No readings yet today"}</Text>
          <View style={styles.statRow}>
            {cell("Highest", max)}
            <View style={styles.vline} />
            {cell("Lowest", min)}
            <View style={styles.vline} />
            {cell("Average", avg)}
          </View>
        </View>
        <StressGauge value={avg} />
      </View>
      <View style={styles.arrow}><ArrowRight size={16} color={colors.textMuted} /></View>
    </Surface>
  );
}

/** Segmented green bar with a lightning bolt, Bevel's "Energy" row. */
export function EnergyBar({ pct, onPress }: { pct: number | null; onPress?: () => void }) {
  if (pct == null) return null;
  const n = 48;
  const lit = pct == null ? 0 : Math.round((pct / 100) * n);
  return (
    <Surface style={[styles.card, styles.energy]} onPress={onPress}>
      <BoltIcon size={16} color={colors.recovery} />
      <Svg width={240} height={16} style={{ flex: 1 }}>
        <Defs>
          <LinearGradient id="energyg" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#2ECC71" />
            <Stop offset="1" stopColor="#7CFF9E" />
          </LinearGradient>
        </Defs>
        {Array.from({ length: n }, (_, i) => (
          <Rect key={i} x={i * 5} y={2} width={2.4} height={12} rx={1} fill={i < lit ? "url(#energyg)" : "rgba(255,255,255,0.10)"} />
        ))}
      </Svg>
      <Text style={styles.energyValue}>{pct == null ? "–%" : `${Math.round(pct)}%`}</Text>
    </Surface>
  );
}

/** Horizontal range bar: track spans min..max, shaded band is your normal range, dot is today. */
function RangeBar({ v, lo, hi, min, max, color }: { v: number; lo: number; hi: number; min: number; max: number; color: string }) {
  const w = 132;
  const h = 14;
  const x = (n: number) => 4 + ((Math.max(min, Math.min(max, n)) - min) / (max - min || 1)) * (w - 8);
  return (
    <Svg width={w} height={h} style={{ marginTop: 10 }}>
      <Rect x={0} y={h / 2 - 2} width={w} height={4} rx={2} fill="rgba(255,255,255,0.08)" />
      <Rect x={x(lo)} y={h / 2 - 2} width={Math.max(4, x(hi) - x(lo))} height={4} rx={2} fill={color} opacity={0.35} />
      <Circle cx={x(v)} cy={h / 2} r={6} fill={color} opacity={0.22} />
      <Circle cx={x(v)} cy={h / 2} r={3.6} fill="#FFFFFF" />
    </Svg>
  );
}

export interface MonitorTileProps {
  icon: ComponentType<IconProps>;
  label: string;
  value: string | null;
  unit?: string;
  status?: string | null;
  /** today's value against the personal normal band, on a min..max track */
  range?: { v: number; lo: number; hi: number; min: number; max: number } | null;
  color?: string;
  onPress?: () => void;
}

export function MonitorTile({ icon: Icon, label, value, unit, status, range, color = colors.recovery, onPress }: MonitorTileProps) {
  const empty = value == null;
  return (
    <Surface onPress={onPress} style={[styles.card, styles.tile, empty && styles.tileEmpty]}>
      <View style={styles.rowCenter}>
        <Icon size={13} color={empty ? colors.textFaint : colors.textMuted} />
        <Text style={[styles.tileLabel, empty && { color: colors.textFaint }]}>{label}</Text>
      </View>
      {empty ? (
        <Text style={styles.noData}>Not measured</Text>
      ) : (
        <>
          <Text style={styles.tileValue}>
            {value}
            {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
          </Text>
          {status ? (
            <View style={[styles.rowCenter, { marginTop: 2 }]}>
              <CheckCircle size={12} color={color} />
              <Text style={[styles.tileStatus, { color }]}>{status}</Text>
            </View>
          ) : null}
          {range ? <RangeBar {...range} color={color} /> : null}
        </>
      )}
    </Surface>
  );
}

function Meta({ icon: Icon, text }: { icon: ComponentType<IconProps>; text: string }) {
  return (
    <View style={styles.meta}>
      <Icon size={12} color={colors.textMuted} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

/** Timeline row for the main sleep. Used on Home (with the timeline button) and on the Sleep screen. */
/** The night's sleep; `date` (a past day) carries through to the sleep screens. */
export function TimelineSleepCard({ date, end, score, asleepS, tone = "card", button = true }: { date?: string; end: string | null; score: number | null; asleepS: number | null; tone?: SurfaceTone; button?: boolean }) {
  const time = end ? new Date(end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "–";
  const h = asleepS != null ? `${Math.floor(asleepS / 3600)}h ${String(Math.round((asleepS % 3600) / 60)).padStart(2, "0")}m` : "–";
  return (
    <Surface tone={tone} style={styles.card}>
      <Pressable onPress={() => router.push(date ? { pathname: "/sleep/night", params: { date } } : "/sleep/night")} style={styles.rowCenter}>
        <View style={styles.moonWrap}><MoonIcon size={18} color={colors.sleep} /></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.metaText}>Woke {time}</Text>
          <Text style={styles.cardTitle}>Primary sleep</Text>
          <View style={[styles.rowCenter, { gap: 14, marginTop: 4 }]}>
            <Meta icon={MoonIcon} text={score != null ? `${Math.round(score)}%` : "–"} />
            <Meta icon={BedIcon} text={h} />
          </View>
        </View>
        <ArrowRight size={16} color={colors.textMuted} />
      </Pressable>
      {button ? (
        <Pressable onPress={() => router.push(date ? { pathname: "/sleep", params: { date } } : "/sleep")} style={styles.button}>
          <Text style={styles.buttonText}>View timeline</Text>
        </Pressable>
      ) : null}
    </Surface>
  );
}

/** One compact line for metrics the current sources don't provide, instead of a grid of empty tiles. */
export function NotTrackedRow({ items }: { items: { icon: ComponentType<IconProps>; label: string }[] }) {
  return (
    <Surface style={[styles.card, styles.notTracked]}>
      <Text style={styles.notTrackedLabel}>Not tracked yet</Text>
      <View style={[styles.rowCenter, { gap: 14, flexWrap: "wrap" }]}>
        {items.map(({ icon: Icon, label }) => (
          <View key={label} style={styles.meta}>
            <Icon size={12} color={colors.textFaint} />
            <Text style={[styles.metaText, { color: colors.textFaint }]}>{label}</Text>
          </View>
        ))}
      </View>
    </Surface>
  );
}

export function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ marginTop: spacing.lg, marginBottom: spacing.md }}>
      <Text style={styles.section}>{title}</Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  cardSub: { ...font.caption, color: colors.textMuted, marginTop: 2 },
  statRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  statCell: { flex: 1 },
  statValue: { fontFamily: fonts.numeral, fontSize: 22, color: colors.text },
  statLabel: { ...font.overline, fontSize: 10, color: colors.textFaint, marginTop: 2 },
  vline: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.hairline, marginRight: 10 },
  arrow: { position: "absolute", top: 14, right: 14 },
  gaugeValue: { textAlign: "center", color: colors.text, fontSize: 22, fontFamily: fonts.numeral },
  energy: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  energyValue: { ...font.heading, fontSize: 15, color: colors.text, minWidth: 44, textAlign: "right" },
  tile: { width: "48.5%", minHeight: 112, padding: 14, marginBottom: 10 },
  tileEmpty: { minHeight: 0, opacity: 0.7 },
  tileLabel: { ...font.overline, fontSize: 11, color: colors.textMuted },
  tileValue: { ...font.number, fontSize: 28, color: colors.text, marginTop: 6 },
  tileUnit: { fontSize: 13, color: colors.textMuted, fontFamily: undefined, fontWeight: "500" },
  tileStatus: { ...font.label, fontSize: 13 },
  noData: { ...font.caption, color: colors.textFaint, marginTop: 8 },
  meta: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { ...font.caption, color: colors.textMuted },
  notTracked: { paddingVertical: 12, gap: 6 },
  notTrackedLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  moonWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.sleep}26`, alignItems: "center", justifyContent: "center" },
  button: { marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.sm, paddingVertical: 12, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)" },
  buttonText: { ...font.heading, fontSize: 15, color: colors.text },
  section: { ...font.heading, fontSize: 17, color: colors.text },
});
