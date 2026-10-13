import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { BodyMap } from "@/components/BodyMap";
import { FocusBar, LineChart, ZONE_COLORS, ZoneBars } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { Dial } from "@/components/Dial";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api, type MuscleId, type WorkoutDetail } from "@/lib/api";
import { sportMeta } from "@/lib/sport";
import type { MuscleFill } from "@/lib/strength";
import { clockDuration, distance, elevation, getUnits, pace } from "@/lib/units";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

function strainBand(v: number): string {
  if (v < 6) return "Light";
  if (v < 11) return "Moderate";
  if (v < 15) return "High";
  return "All out";
}

const HRR_SCALE = ["Poor", "Fair", "Good", "Excellent", "Superior"];
const METHOD_LABEL: Record<string, string> = {
  age_formula: "age formula",
  observed: "highest HR recorded",
  user: "set by you",
  field_test: "field test",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function hrCurve(w: WorkoutDetail) {
  if (w.stream.n > 0) {
    return { points: w.stream.points.map((p) => ({ x: p.t, y: p.hr })), step: false, method: "stream" as const };
  }
  // no FIT stream yet: step line of lap averages over elapsed time
  const pts: { x: number; y: number | null }[] = [];
  let t = 0;
  for (const lap of w.laps) {
    if (!lap.duration_s) continue;
    pts.push({ x: t, y: lap.avg_hr });
    t += lap.duration_s;
    pts.push({ x: t, y: lap.avg_hr });
  }
  return { points: pts, step: false, method: "laps" as const };
}

function paceCurve(w: WorkoutDetail) {
  if (w.stream.n > 0) {
    // smooth speed over ~5 points (about a minute at 300 points per run), break the line at stops
    const pts = w.stream.points;
    return pts.map((p, i) => {
      const win = pts.slice(Math.max(0, i - 2), i + 3).map((q) => q.speed_mps).filter((v): v is number => v != null && v > 0.5);
      const v = win.length >= 3 ? win.reduce((a, b) => a + b, 0) / win.length : null;
      return { x: p.t, y: v ? 1000 / v : null };
    });
  }
  const pts: { x: number; y: number | null }[] = [];
  let t = 0;
  for (const lap of w.laps) {
    if (!lap.duration_s) continue;
    pts.push({ x: t, y: lap.avg_pace_s_per_km });
    t += lap.duration_s;
    pts.push({ x: t, y: lap.avg_pace_s_per_km });
  }
  return pts;
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ["activity", id], queryFn: () => api.activity(id) });
  const w = q.data;

  if (!w) {
    return (
      <View style={styles.screen}>
        <DetailHeader title="Workout" mode="close" />
        <Text style={styles.note}>{q.isError ? `Cannot load this workout (${String(q.error)})` : "Loading…"}</Text>
      </View>
    );
  }

  const meta = sportMeta(w.sport_code, w.sport);
  const start = new Date(w.start);
  const end = w.end ? new Date(w.end) : null;
  const when = `${start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}${end ? ` – ${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}`;
  const s = w.stats;
  const tl = w.coros.training_load;
  const hr = hrCurve(w);
  const hmax = w.hr_max?.value;
  const bands = w.zones?.zones.map((z, i) => ({ lo: z.lo_bpm ?? 0, hi: z.hi_bpm ?? 250, color: ZONE_COLORS[i] }));
  const duration = hr.points.length ? hr.points[hr.points.length - 1].x : (s.active_s ?? 0);
  const pacePts = paceCurve(w);
  const muscleFills: Partial<Record<MuscleId, MuscleFill>> = {};
  const topShare = Math.max(1, ...w.muscles.map((m) => m.share));
  for (const m of w.muscles) muscleFills[m.id] = { color: colors.strain, opacity: 0.25 + 0.75 * (m.share / topShare) };
  const unitMi = getUnits() === "imperial";

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title={meta.name} subtitle={when} mode="close" />
        <View style={styles.body}>
          <Surface style={styles.hero} radiusSize={radius.lg}>
            <View style={styles.heroLeft}>
              <View style={[styles.sportGlow, { backgroundColor: `${meta.color}22`, shadowColor: meta.color }]}>
                <meta.Icon size={30} color={meta.color} />
              </View>
              <Text style={styles.place} numberOfLines={1}>{w.location ?? meta.name}</Text>
              <View style={styles.badge}><Text style={styles.badgeText}>{w.source.toUpperCase()}</Text></View>
            </View>
            <View style={{ alignItems: "center" }}>
              <Dial progress={w.load.method !== "none" ? w.load.strain / 21 : null} value={w.load.method !== "none" ? w.load.strain.toFixed(1) : "–"} label="Strain" color={colors.strain} size={118} />
              <Text style={styles.heroCaption}>{w.load.method !== "none" ? `${strainBand(w.load.strain)} · ${Math.round(w.load.trimp)} TRIMP` : "No heart rate"}</Text>
            </View>
          </Surface>

          <View style={styles.grid}>
            <Stat label="Active" value={clockDuration(s.active_s)} />
            <Stat label="Total" value={clockDuration(s.total_s)} />
            {s.distance_m ? <Stat label="Distance" value={distance(s.distance_m)} /> : null}
            {s.avg_pace_s_per_km ? <Stat label="Avg pace" value={pace(s.avg_pace_s_per_km)} /> : null}
            {s.best_km_s ? <Stat label="Best km" value={pace(s.best_km_s, "metric")} /> : null}
            <Stat label="Avg HR" value={s.avg_hr ? `${s.avg_hr} bpm` : "–"} />
            <Stat label="Max HR" value={s.max_hr ? `${s.max_hr} bpm` : "–"} />
            {s.avg_power_w ? <Stat label="Avg power" value={`${Math.round(s.avg_power_w)} W`} /> : null}
            {s.avg_cadence ? <Stat label="Cadence" value={`${s.avg_cadence} spm`} /> : null}
            {s.stride_m ? <Stat label="Stride" value={`${s.stride_m.toFixed(2)} m`} /> : null}
            {s.elev_gain_m != null ? <Stat label="Elevation" value={`+${elevation(s.elev_gain_m)} / −${elevation(s.elev_loss_m)}`} /> : null}
            {s.calories ? <Stat label="Energy" value={`${s.calories} kcal`} /> : null}
          </View>

          <SectionLabel title="Heart rate" note={hmax ? `HRmax ${hmax} · ${METHOD_LABEL[w.hr_max!.method] ?? w.hr_max!.method}` : undefined} />
          <Surface style={styles.card}>
            {hr.points.length ? (
              <>
                <LineChart id="hr" points={hr.points} color={colors.recoveryRed} bands={bands} height={160} xLabels={["0:00", clockDuration(duration)]} />
                <Text style={styles.note}>
                  {hr.method === "stream"
                    ? `Per-second heart rate from the FIT file (${w.stream.n.toLocaleString()} samples). Shaded bands are your zones.`
                    : "Lap averages from COROS. The per-second curve appears once this workout's FIT file is synced."}
                </Text>
              </>
            ) : (
              <Text style={styles.note}>No heart-rate data for this workout.</Text>
            )}
          </Surface>

          {w.zones ? (
            <Surface style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Heart-rate zones</Text>
                <Text style={styles.method}>{w.zones.method === "stream" ? "per-second" : "estimated from laps"}</Text>
              </View>
              <ZoneBars zones={w.zones.zones} />
            </Surface>
          ) : null}

          {w.zones?.focus ? (
            <Surface style={styles.card}>
              <Text style={[styles.cardTitle, { marginBottom: 12 }]}>Cardio focus</Text>
              <FocusBar focus={w.zones.focus} />
            </Surface>
          ) : null}

          <Surface style={styles.card}>
            <Text style={styles.cardTitle}>Heart-rate recovery</Text>
            {w.hr_recovery ? (
              <>
                <View style={styles.hrrRow}>
                  <Text style={styles.hrrBig}>−{w.hr_recovery.drop_bpm}<Text style={styles.unit}> bpm</Text></Text>
                  <Text style={styles.note}>{w.hr_recovery.from_bpm} → {w.hr_recovery.to_bpm} bpm in the first minute</Text>
                </View>
                <View style={styles.scale}>
                  {HRR_SCALE.map((r) => (
                    <View key={r} style={[styles.scaleItem, r === w.hr_recovery!.rating && styles.scaleOn]}>
                      <Text style={[styles.scaleText, r === w.hr_recovery!.rating && { color: colors.text }]}>{r}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.note}>
                {w.stream.n > 0
                  ? "No hard effort followed by a recorded minute of easing off. Keep the watch recording for 60 s after you stop."
                  : "Needs the per-second heart rate after your last hard effort, from the FIT file."}
              </Text>
            )}
          </Surface>

          {pacePts.some((p) => p.y != null) ? (
            <>
              <SectionLabel title="Pace" note={w.stream.n ? "per second" : "per lap"} />
              <Surface style={styles.card}>
                <LineChart
                  id="pace"
                  points={pacePts.map((p) => ({ x: p.x, y: p.y != null ? -p.y : null }))}
                  color={colors.recovery}
                  height={130}
                  yFormat={(v) => pace(-v).replace(/ \/(km|mi)$/, "")}
                  robust
                  xLabels={["0:00", clockDuration(duration)]}
                />
              </Surface>
            </>
          ) : null}

          {w.laps.length ? (
            <>
              <SectionLabel title="Laps" note={`${w.laps.length} × ${unitMi ? "mile" : "km"} splits`} />
              <Surface style={styles.card}>
                <View style={styles.lapHead}>
                  {["#", "Dist", "Time", "Pace", "HR", "Power"].map((h) => (
                    <Text key={h} style={[styles.lapCell, styles.lapHeadText, h === "#" && { flex: 0.5 }]}>{h}</Text>
                  ))}
                </View>
                {w.laps.map((l) => (
                  <View key={l.idx} style={styles.lapRow}>
                    <Text style={[styles.lapCell, { flex: 0.5, color: colors.textMuted }]}>{l.idx}</Text>
                    <Text style={styles.lapCell}>{distance(l.distance_m).replace(/ (mi|km)$/, "")}</Text>
                    <Text style={styles.lapCell}>{clockDuration(l.duration_s)}</Text>
                    <Text style={styles.lapCell}>{pace(l.avg_pace_s_per_km).replace(/ \/(km|mi)$/, "")}</Text>
                    <Text style={[styles.lapCell, { color: l.avg_hr && hmax ? ZONE_COLORS[Math.min(4, Math.max(0, Math.floor((l.avg_hr / hmax - 0.5) * 10)))] : colors.text }]}>{l.avg_hr ?? "–"}</Text>
                    <Text style={styles.lapCell}>{l.avg_power_w ?? "–"}</Text>
                  </View>
                ))}
              </Surface>
            </>
          ) : null}

          {w.muscles.length ? (
            <>
              <SectionLabel title="Muscles worked" note="share of this workout's load" />
              <Surface style={[styles.card, styles.muscles]}>
                <BodyMap side="front" fills={muscleFills} width={64} />
                <BodyMap side="back" fills={muscleFills} width={64} />
                <View style={{ flex: 1, gap: 7 }}>
                  {w.muscles.slice(0, 5).map((m) => (
                    <View key={m.id} style={styles.muscleRow}>
                      <Text style={styles.muscleName}>{m.name}</Text>
                      <View style={styles.muscleTrack}><View style={[styles.muscleFill, { width: `${(100 * m.share) / topShare}%` }]} /></View>
                      <Text style={styles.musclePct}>{Math.round(m.share)}%</Text>
                    </View>
                  ))}
                </View>
              </Surface>
            </>
          ) : null}

          {Object.values(w.coros).some((v) => v != null) ? (
          <>
          <SectionLabel title="COROS says" note="their numbers, for comparison" />
          <Surface style={styles.card}>
            <View style={styles.grid2}>
              <Stat label="Training load" value={tl != null ? String(Math.round(tl)) : "–"} />
              <Stat label="Aerobic TE" value={w.coros.aerobic_te?.toFixed(1) ?? "–"} />
              <Stat label="Anaerobic TE" value={w.coros.anaerobic_te?.toFixed(1) ?? "–"} />
              <Stat label="Focus" value={w.coros.training_focus ?? "–"} />
              <Stat label="Performance" value={w.coros.performance ?? "–"} />
            </View>
          </Surface>
          </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md, paddingVertical: spacing.lg },
  heroLeft: { flex: 1, gap: 8 },
  sportGlow: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center", shadowOpacity: 0.8, shadowRadius: 18 },
  place: { ...font.heading, color: colors.text },
  badge: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.08)" },
  badgeText: { ...font.overline, fontSize: 10, color: colors.textMuted },
  heroCaption: { ...font.caption, color: colors.textMuted, marginTop: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  grid2: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  stat: { width: "48.5%", backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
  statLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  statValue: { fontFamily: fonts.numeral, fontSize: 20, color: colors.text, marginTop: 3 },
  card: { marginBottom: spacing.md },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  method: { ...font.caption, color: colors.textFaint },
  note: { ...font.caption, color: colors.textMuted, marginTop: 8, lineHeight: 17, paddingHorizontal: 2 },
  unit: { fontSize: 14, fontFamily: fonts.label, color: colors.textMuted },
  hrrRow: { marginTop: 6 },
  hrrBig: { fontFamily: fonts.numeral, fontSize: 34, color: colors.text },
  scale: { flexDirection: "row", gap: 4, marginTop: 12 },
  scaleItem: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: "rgba(255,255,255,0.05)", alignItems: "center" },
  scaleOn: { backgroundColor: `${colors.recovery}40` },
  scaleText: { ...font.caption, fontSize: 11, color: colors.textFaint },
  lapHead: { flexDirection: "row", paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  lapHeadText: { ...font.overline, fontSize: 10, color: colors.textFaint },
  lapRow: { flexDirection: "row", paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.04)" },
  lapCell: { flex: 1, fontFamily: fonts.numeral, fontSize: 15, color: colors.text },
  muscles: { flexDirection: "row", alignItems: "center", gap: 6 },
  muscleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  muscleName: { ...font.label, color: colors.text, width: 76 },
  muscleTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  muscleFill: { height: 6, borderRadius: 3, backgroundColor: colors.strain },
  musclePct: { fontFamily: fonts.numeral, fontSize: 13, color: colors.textMuted, width: 34, textAlign: "right" },
});
