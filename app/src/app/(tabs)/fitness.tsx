import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Gauge } from "@/components/Gauge";
import { Header, RoundButton } from "@/components/Header";
import { CalendarIcon, CloudIcon, DotsIcon, PlusIcon, ZzzIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { WeekStrip, type WeekDay } from "@/components/WeekStrip";
import { WorkoutCard } from "@/components/WorkoutCard";
import { dayOfMonth, longDayLabel, weekOf, weekdayIndex, WEEKDAY_LETTERS } from "@/lib/dates";
import { hms } from "@/lib/format";
import { sportMeta } from "@/lib/sport";
import { todayIso, useDays } from "@/lib/useDays";
import { colors, font, spacing } from "@/theme/tokens";

function loadStatus(ratio: number | null | undefined, comment: string | null | undefined): string | null {
  if (comment) return comment;
  if (ratio == null) return null;
  if (ratio < 0.8) return "Detraining";
  if (ratio <= 1.3) return "Productive";
  if (ratio <= 1.5) return "Overreaching";
  return "Overload";
}

export default function FitnessScreen() {
  const q = useDays(28);
  const today = todayIso();
  const [selected, setSelected] = useState(today);
  const week = useMemo(() => weekOf(selected), [selected]);
  const days: WeekDay[] = week.map((iso) => {
    const d = q.byDate.get(iso);
    const first = d?.activities[0];
    const meta = first ? sportMeta(first.sport_code, first.sport) : null;
    return {
      iso,
      weekday: WEEKDAY_LETTERS[weekdayIndex(iso)],
      day: dayOfMonth(iso),
      icon: meta ? { Icon: meta.Icon, color: meta.color } : { Icon: ZzzIcon, color: colors.textFaint },
      dim: iso > today,
    };
  });
  const day = q.byDate.get(selected);
  const latest = q.days[q.days.length - 1];
  const weekTotal = q.days.filter((d) => week.includes(d.date)).reduce((s, d) => s + d.activities.reduce((t, a) => t + (a.duration_s ?? 0), 0), 0);
  const weekKcal = q.days.filter((d) => week.includes(d.date)).reduce((s, d) => s + d.activities.reduce((t, a) => t + (a.calories ?? 0), 0), 0);

  return (
    <Screen glow="fitness" refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <Header
        centered
        title="Fitness"
        left={<RoundButton><CalendarIcon size={20} color={colors.text} /></RoundButton>}
        right={<RoundButton><DotsIcon size={20} color={colors.text} /></RoundButton>}
      />
      <WeekStrip days={days} selected={selected} onSelect={setSelected} />

      <View style={styles.dayRow}>
        <Text style={styles.dayTitle}>{longDayLabel(selected)}</Text>
        <View style={styles.dayRight}>
          <View style={styles.weatherPill}>
            <CloudIcon size={14} color={colors.text} />
            <Text style={styles.weatherText}>–°F</Text>
          </View>
          <Pressable style={styles.smallRound}><PlusIcon size={18} color={colors.text} /></Pressable>
        </View>
      </View>
      {day?.activities.length ? day.activities.map((a) => <WorkoutCard key={a.id} a={a} />) : (
        <Card>
          <Text style={styles.empty}>Rest day</Text>
        </Card>
      )}

      <Text style={styles.section}>Training load</Text>
      <View style={styles.gauges}>
        <Gauge
          title="Cardio"
          value={latest?.daily.coros_stl ?? null}
          min={0}
          max={Math.max(80, Math.ceil(((latest?.daily.coros_ltl ?? 50) * 1.6) / 10) * 10)}
          optimal={[Math.round((latest?.daily.coros_ltl ?? 50) * 0.8), Math.round((latest?.daily.coros_ltl ?? 50) * 1.3)]}
          status={loadStatus(latest?.daily.coros_load_ratio, latest?.daily.coros_load_comment)}
          color={colors.cardio}
        />
        <Gauge title="Muscular" value={null} min={0} max={100} optimal={[33, 74]} status="Coming soon" color={colors.muscular} />
      </View>
      <Text style={styles.footnote}>Cardio load is COROS&apos;s short-term load vs its long-term load until our TRIMP-based load lands (phase 2).</Text>

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Cardio</Text>
        <Text style={styles.edit}>Edit</Text>
      </View>
      <View style={styles.grid}>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>All Activities</Text>
          <Text style={styles.cardValue}>{hms(weekTotal)}</Text>
          <Text style={styles.cardSub}>Active Duration · this week</Text>
        </Card>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>All Activities</Text>
          <Text style={styles.cardValue}>{weekKcal.toLocaleString()} kcal</Text>
          <Text style={styles.cardSub}>Active Energy · this week</Text>
        </Card>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>VO₂ Max</Text>
          <Text style={[styles.cardValue, { color: colors.textMuted }]}>No data</Text>
          <Text style={styles.cardSub}>Needs FIT streams (phase 3)</Text>
        </Card>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>Heart Rate Recovery</Text>
          <Text style={[styles.cardValue, { color: colors.textMuted }]}>No data</Text>
          <Text style={styles.cardSub}>Needs FIT streams (phase 3)</Text>
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md },
  dayTitle: { ...font.heading, fontSize: 20, color: colors.text },
  dayRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  weatherPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.pill, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
  weatherText: { ...font.label, color: colors.text },
  smallRound: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  empty: { ...font.body, color: colors.textMuted, textAlign: "center" },
  section: { ...font.heading, fontSize: 20, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  edit: { ...font.label, color: colors.textMuted, textDecorationLine: "underline" },
  gauges: { flexDirection: "row", justifyContent: "space-between" },
  footnote: { ...font.caption, color: colors.textFaint, marginBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  half: { width: "48%", minHeight: 130 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  cardValue: { ...font.number, fontSize: 26, color: colors.text, marginTop: 6 },
  cardSub: { ...font.caption, color: colors.textMuted, marginTop: 2 },
});
