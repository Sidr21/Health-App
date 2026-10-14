import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { Gauge } from "@/components/Gauge";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { comps, shortDate, type CardioComps } from "@/lib/scores";
import { useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

const STATUS: { name: string; range: string; text: string }[] = [
  { name: "Detraining", range: "< 0.8", text: "This week is lighter than your base. Fine for a recovery week; fitness slips if it lasts." },
  { name: "Productive", range: "0.8–1.3", text: "Load in step with your base: fitness builds without piling up fatigue." },
  { name: "Overreaching", range: "1.3–1.5", text: "A hard block. Useful for a week or two, then ease off." },
  { name: "Overload", range: "> 1.5", text: "Much more than you are used to; injury and illness risk rise." },
];

export default function CardioLoadScreen() {
  const q = useDays(90);
  const latest = [...q.days].reverse().find((d) => d.scores.cardio_load);
  const c = comps<CardioComps>(latest, "cardio_load");
  const rows = q.days.map((d, i) => ({ i, c: comps<CardioComps>(d, "cardio_load"), d }));
  const atl = rows.map((r) => ({ x: r.i, y: r.c?.atl ?? null }));
  const ctl = rows.map((r) => ({ x: r.i, y: r.c?.ctl ?? null }));
  const band = rows.filter((r) => r.c).map((r) => ({ x: r.i, lo: 0.8 * r.c!.ctl, hi: 1.3 * r.c!.ctl }));
  const tsb = rows.map((r) => ({ x: r.i, y: r.c?.tsb ?? null }));
  const coros = latest?.daily;
  const labels: [string, string] | undefined = q.days.length ? [shortDate(q.days[0].date), "Today"] : undefined;

  return (
    <View style={styles.screen}>
      <Backdrop glow="fitness" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Cardio load" subtitle="Fatigue against your fitness base" />
        <View style={styles.body}>
          <View style={styles.hero}>
            <Gauge
              title="Cardio"
              value={c ? Math.round(c.atl) : null}
              min={0}
              max={Math.max(40, Math.ceil((Math.max(c?.atl ?? 0, c?.optimal?.[1] ?? 30) * 1.4) / 10) * 10)}
              optimal={c?.optimal ? [Math.round(c.optimal[0]), Math.round(c.optimal[1])] : [0, 0]}
              status={c?.status ?? null}
              color={colors.cardio}
              size={220}
            />
          </View>

          <View style={styles.statRow}>
            <Surface style={styles.stat}><Text style={styles.statLabel}>FATIGUE</Text><Text style={styles.statVal}>{c ? c.atl.toFixed(0) : "–"}</Text><Text style={styles.method}>7-day</Text></Surface>
            <Surface style={styles.stat}><Text style={styles.statLabel}>FITNESS</Text><Text style={styles.statVal}>{c ? c.ctl.toFixed(0) : "–"}</Text><Text style={styles.method}>42-day</Text></Surface>
            <Surface style={styles.stat}><Text style={styles.statLabel}>FORM</Text><Text style={[styles.statVal, { color: c && c.tsb < -10 ? colors.recoveryAmber : colors.text }]}>{c ? `${c.tsb > 0 ? "+" : ""}${c.tsb.toFixed(0)}` : "–"}</Text><Text style={styles.method}>fitness − fatigue</Text></Surface>
          </View>

          <SectionLabel title="Fatigue vs fitness" note="last 90 days" />
          <Surface style={styles.card}>
            <LineChart
              id="cl-atl"
              points={atl}
              color={colors.cardio}
              overlays={[{ points: ctl, color: colors.textMuted, dashed: true }]}
              rangeBand={{ points: band, color: colors.recovery }}
              height={180}
              xLabels={labels}
            />
            <View style={styles.legend}>
              <View style={[styles.swatch, { backgroundColor: colors.cardio }]} /><Text style={styles.method}>Fatigue (gauge value)</Text>
              <View style={[styles.swatch, { backgroundColor: colors.textMuted }]} /><Text style={styles.method}>Fitness</Text>
              <View style={[styles.swatch, { backgroundColor: colors.recovery, opacity: 0.4 }]} /><Text style={styles.method}>Optimal</Text>
            </View>
          </Surface>

          <SectionLabel title="Form" note="positive = fresh" />
          <Surface style={styles.card}>
            <LineChart id="cl-tsb" points={tsb} color={colors.recovery} height={130} bands={[{ lo: -10, hi: 10, color: colors.recovery }]} xLabels={labels} />
          </Surface>

          <SectionLabel title="What the status means" note={c?.ratio != null ? `ratio ${c.ratio.toFixed(2)}` : undefined} />
          <Surface style={styles.card}>
            {c?.status === "Building baseline" ? (
              <Text style={styles.text}>Status words need 28 days of history ({c.history_days} so far); until then the gauge shows the number only.</Text>
            ) : null}
            {STATUS.map((s) => (
              <View key={s.name} style={[styles.status, s.name === c?.status && styles.statusOn]}>
                <View style={styles.statusHead}>
                  <Text style={[styles.statusName, s.name === c?.status && { color: colors.text }]}>{s.name}</Text>
                  <Text style={styles.method}>{s.range}</Text>
                </View>
                <Text style={styles.text}>{s.text}</Text>
              </View>
            ))}
            <Text style={styles.text}>
              Fatigue and fitness are 7- and 42-day exponentially weighted averages of daily TRIMP{c ? ` (${Math.round(c.week_trimp)} TRIMP in the last 7 days)` : ""}. The optimal band is 0.8–1.3 × fitness.
            </Text>
          </Surface>

          {coros?.coros_stl != null ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>COROS says</Text>
              <Text style={styles.text}>
                Short-term load {coros.coros_stl} · long-term {coros.coros_ltl ?? "–"} · ratio {coros.coros_load_ratio ?? "–"}
                {coros.coros_load_comment ? ` · ${coros.coros_load_comment}` : ""}
              </Text>
            </Surface>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { alignItems: "center", marginBottom: spacing.md },
  statRow: { flexDirection: "row", gap: 8, marginBottom: spacing.sm },
  stat: { flex: 1, gap: 2 },
  statLabel: { ...font.overline, fontSize: 10, color: colors.textFaint },
  statVal: { fontFamily: fonts.numeral, fontSize: 26, color: colors.text },
  method: { ...font.caption, color: colors.textFaint },
  card: { marginBottom: spacing.md, gap: 10 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  legend: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  swatch: { width: 10, height: 3, borderRadius: 2, marginLeft: 6 },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  status: { borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "transparent", gap: 2 },
  statusOn: { borderColor: colors.cardio, backgroundColor: "rgba(61,139,255,0.10)" },
  statusHead: { flexDirection: "row", justifyContent: "space-between" },
  statusName: { ...font.heading, fontSize: 14, color: colors.textMuted },
});
