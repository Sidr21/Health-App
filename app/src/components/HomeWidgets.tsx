/** Bevel Home building blocks: stress card, energy bar, health-monitor tile, timeline card. */
import { router } from "expo-router";
import React, { type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";

import { ArrowRight, BoltIcon, CheckCircle, MoonIcon, type IconProps } from "@/components/icons";
import { Surface } from "@/components/Surface";
import { colors, font, radius, spacing } from "@/theme/tokens";

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
            <Stop offset="0" stopColor="#34353F" />
            <Stop offset="1" stopColor="#1A1B21" />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r - 6} fill="url(#stressdisc)" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
        {ticks.map((a, i) => {
          const o = polar(cx, cy, r + 4, a);
          const inn = polar(cx, cy, r - 1, a);
          const lit = vA != null && a <= vA;
          return <Path key={i} d={`M${inn.x} ${inn.y} L${o.x} ${o.y}`} stroke={lit ? "url(#stressg)" : colors.hairline} strokeWidth={2} strokeLinecap="round" />;
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
export function EnergyBar({ pct }: { pct: number | null }) {
  const n = 48;
  const lit = pct == null ? 0 : Math.round((pct / 100) * n);
  return (
    <Surface style={[styles.card, styles.energy]}>
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

/** Vertical pill meter on the right of each Health Monitor tile. */
function VerticalMeter({ frac, color, height = 72 }: { frac: number | null; color: string; height?: number }) {
  const w = 10;
  const fillH = frac == null ? 0 : Math.max(6, Math.min(height - 4, frac * (height - 4)));
  return (
    <Svg width={w + 6} height={height}>
      <Rect x={3} y={0} width={w} height={height} rx={w / 2} fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
      {frac != null ? (
        <>
          <Rect x={3} y={height - fillH} width={w} height={fillH} rx={w / 2} fill={color} opacity={0.9} />
          <Circle cx={3 + w / 2} cy={height - fillH} r={3} fill={colors.card} stroke={color} strokeWidth={1.5} />
        </>
      ) : null}
    </Svg>
  );
}

export interface MonitorTileProps {
  icon: ComponentType<IconProps>;
  label: string;
  value: string | null;
  unit?: string;
  status?: string | null;
  /** 0..1 fill of the meter; null for no data */
  frac: number | null;
  color?: string;
  onPress?: () => void;
}

export function MonitorTile({ icon: Icon, label, value, unit, status, frac, color = colors.recovery, onPress }: MonitorTileProps) {
  const empty = value == null;
  return (
    <Surface onPress={onPress} style={[styles.card, styles.tile]}>
      <View style={{ flex: 1 }}>
        <View style={styles.rowCenter}>
          <Icon size={14} color={colors.textMuted} />
          <Text style={styles.tileLabel}>{label}</Text>
        </View>
        {empty ? (
          <Text style={styles.noData}>No{"\n"}data</Text>
        ) : (
          <>
            <Text style={styles.tileValue}>
              {value}
              {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
            </Text>
            {status ? (
              <View style={styles.rowCenter}>
                <CheckCircle size={13} color={color} />
                <Text style={[styles.tileStatus, { color }]}>{status}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>
      <VerticalMeter frac={empty ? null : frac} color={color} />
    </Surface>
  );
}

export function TimelineSleepCard({ end, score, asleepS }: { end: string | null; score: number | null; asleepS: number | null }) {
  const time = end ? new Date(end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "–";
  const h = asleepS != null ? `${Math.floor(asleepS / 3600)}h ${Math.round((asleepS % 3600) / 60)}m` : "–";
  return (
    <Surface style={styles.card}>
      <Pressable onPress={() => router.push("/sleep/night")} style={styles.rowCenter}>
        <View style={styles.moonWrap}><MoonIcon size={18} color={colors.sleep} /></View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.cardSub}>{time}</Text>
          <Text style={styles.cardTitle}>Primary sleep</Text>
          <Text style={styles.cardSub}>{score != null ? `◑ ${Math.round(score)}%` : "◑ –"}   🛏 {h}</Text>
        </View>
        <ArrowRight size={16} color={colors.textMuted} />
      </Pressable>
      <Pressable onPress={() => router.push("/sleep")} style={styles.button}>
        <Text style={styles.buttonText}>View timeline</Text>
      </Pressable>
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
  statValue: { ...font.heading, color: colors.textMuted },
  statLabel: { ...font.caption, color: colors.textFaint, marginTop: 2 },
  vline: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.hairline, marginRight: 10 },
  arrow: { position: "absolute", top: 14, right: 14 },
  gaugeValue: { textAlign: "center", color: colors.text, fontSize: 18, fontWeight: "600" },
  energy: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  energyValue: { ...font.heading, fontSize: 15, color: colors.text, minWidth: 44, textAlign: "right" },
  tile: { width: "48%", flexDirection: "row", alignItems: "center", minHeight: 104, padding: 14 },
  tileLabel: { ...font.label, color: colors.textMuted },
  tileValue: { ...font.number, fontSize: 24, color: colors.text, marginTop: 6 },
  tileUnit: { fontSize: 14, color: colors.textMuted, fontWeight: "500" },
  tileStatus: { ...font.label, fontSize: 14 },
  noData: { fontSize: 22, fontWeight: "600", color: colors.textFaint, marginTop: 6, lineHeight: 26 },
  moonWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: `${colors.sleep}26`, alignItems: "center", justifyContent: "center" },
  button: { marginTop: spacing.md, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: radius.sm, paddingVertical: 12, alignItems: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)" },
  buttonText: { ...font.heading, fontSize: 15, color: colors.text },
  section: { ...font.heading, fontSize: 17, color: colors.text },
});
