import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Gauge } from "@/components/Gauge";
import { Header, RoundButton } from "@/components/Header";
import { CalendarIcon, DotsIcon, PlusIcon, ZzzIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/SectionLabel";
import { WeekStrip, type WeekDay } from "@/components/WeekStrip";
import { WorkoutCard } from "@/components/WorkoutCard";
import { FreshnessCard, SessionCard, StrengthStatCards } from "@/components/StrengthWidgets";
import { dayOfMonth, longDayLabel, weekOf, weekdayIndex, WEEKDAY_LETTERS } from "@/lib/dates";
import { hms } from "@/lib/format";
import { sportMeta } from "@/lib/sport";
import { useStrength } from "@/lib/strength";
import { todayIso, useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

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
  const strength = useStrength(today);
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
          <Pressable style={styles.smallRound}><PlusIcon size={18} color={colors.text} /></Pressable>
        </View>
      </View>
      {day?.activities.length ? day.activities.map((a) => <WorkoutCard key={a.id} a={a} />) : (
        <Card>
          <Text style={styles.empty}>Rest day</Text>
        </Card>
      )}

      <SectionLabel title="Training load" />
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
        <Gauge
          title="Muscular"
          value={strength.data ? Math.round(strength.data.load.acute) : null}
          min={0}
          max={Math.max(40, Math.ceil(((strength.data?.load.optimal?.[1] ?? strength.data?.load.acute ?? 30) * 1.4) / 10) * 10)}
          optimal={strength.data?.load.optimal ? [Math.round(strength.data.load.optimal[0]), Math.round(strength.data.load.optimal[1])] : [0, 0]}
          status={strength.data?.load.status ?? null}
          color={colors.muscular}
        />
      </View>
      <Text style={styles.footnote}>Cardio is COROS&apos;s short- vs long-term load until our TRIMP load lands. Muscular is set-equivalents over 7 days, from lifting and cardio.</Text>

      <SectionLabel title="Cardio" action={<Text style={styles.edit}>Edit</Text>} />
      <View style={styles.grid}>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>Active time</Text>
          <Text style={styles.cardValue}>{hms(weekTotal)}</Text>
          <Text style={styles.cardSub}>This week</Text>
        </Card>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>Active energy</Text>
          <Text style={styles.cardValue}>{weekKcal.toLocaleString()}<Text style={styles.cardUnit}> kcal</Text></Text>
          <Text style={styles.cardSub}>This week</Text>
        </Card>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>VO₂ max</Text>
          <Text style={styles.cardPending}>Pending</Text>
          <Text style={styles.cardSub}>Our own estimate from FIT heart-rate and pace streams</Text>
        </Card>
        <Card style={styles.half}>
          <Text style={styles.cardTitle}>HR recovery</Text>
          <Text style={styles.cardPending}>Pending</Text>
          <Text style={styles.cardSub}>60 s drop after hard efforts, from FIT streams</Text>
        </Card>
      </View>

      <SectionLabel
        title="Strength"
        action={
          <Pressable onPress={() => router.push("/strength/log")} style={styles.logBtn}>
            <PlusIcon size={13} color={colors.text} />
            <Text style={styles.logText}>Log lift</Text>
          </Pressable>
        }
      />
      {strength.data ? (
        <>
          <StrengthStatCards s={strength.data} />
          <FreshnessCard s={strength.data} />
          {strength.data.sessions.length ? (
            strength.data.sessions.map((x) => <SessionCard key={`${x.source}:${x.key}`} x={x} />)
          ) : (
            <Card>
              <Text style={styles.emptyTitle}>No lifting in the last 7 days</Text>
              <Text style={styles.cardSub}>Log a session with +, record it on your COROS in strength mode, or import a Strong or Hevy export.</Text>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <Text style={styles.cardSub}>{strength.isError ? `Cannot reach the backend (${String(strength.error)})` : "Loading strength…"}</Text>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.xl, marginBottom: spacing.md },
  dayTitle: { ...font.heading, fontSize: 20, color: colors.text },
  dayRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  smallRound: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  empty: { ...font.body, color: colors.textMuted, textAlign: "center" },
  section: { ...font.heading, fontSize: 20, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },
  sectionRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  edit: { ...font.label, color: colors.textMuted, textDecorationLine: "underline" },
  gauges: { flexDirection: "row", justifyContent: "space-between" },
  footnote: { ...font.caption, color: colors.textFaint, marginBottom: spacing.sm },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  half: { width: "48.5%", minHeight: 124 },
  cardTitle: { ...font.overline, fontSize: 11, color: colors.textMuted },
  cardValue: { ...font.number, fontSize: 28, color: colors.text, marginTop: 6 },
  cardUnit: { fontSize: 13, fontFamily: fonts.label, color: colors.textMuted },
  cardPending: { ...font.heading, fontSize: 15, color: colors.textMuted, marginTop: 10 },
  cardSub: { ...font.caption, color: colors.textFaint, marginTop: 4 },
  emptyTitle: { ...font.heading, fontSize: 15, color: colors.text },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  logText: { ...font.label, color: colors.text },
});
