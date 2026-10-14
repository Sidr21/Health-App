import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Gauge } from "@/components/Gauge";
import { Header, RoundButton } from "@/components/Header";
import { ArrowRight, CalendarIcon, DotsIcon, DumbbellIcon, FlameIcon, HeartIcon, PlusIcon, PulseIcon, RouteIcon, ZzzIcon } from "@/components/icons";
import { DatePickerSheet, MenuSheet } from "@/components/Sheet";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/SectionLabel";
import { WeekStrip, type WeekDay } from "@/components/WeekStrip";
import { WorkoutCard } from "@/components/WorkoutCard";
import { FreshnessCard, SessionCard, StrengthStatCards } from "@/components/StrengthWidgets";
import { dayOfMonth, longDayLabel, weekOf, weekdayIndex, WEEKDAY_LETTERS } from "@/lib/dates";
import { hms } from "@/lib/format";
import { clockDuration } from "@/lib/units";
import { sportMeta } from "@/lib/sport";
import { api } from "@/lib/api";
import { useStrength } from "@/lib/strength";
import { todayIso, useDays } from "@/lib/useDays";
import { colors, font, fonts, spacing } from "@/theme/tokens";

export default function FitnessScreen() {
  const q = useDays(120);
  const today = todayIso();
  const models = useQuery({ queryKey: ["fitness-models"], queryFn: api.fitnessModels });
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<"more" | "add" | null>(null);
  const marked = useMemo(() => new Set(q.days.filter((d) => d.activities.length).map((d) => d.date)), [q.days]);
  const vo2 = models.data?.vo2max;
  const vo2Value = vo2?.ours?.value ?? vo2?.coros?.value ?? null;
  const hrr = models.data?.hr_recovery;
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
  const cardio = latest?.scores.cardio_load?.components as { atl: number; ctl: number; optimal: [number, number] | null; status: string } | undefined;
  const weekTotal = q.days.filter((d) => week.includes(d.date)).reduce((s, d) => s + d.activities.reduce((t, a) => t + (a.duration_s ?? 0), 0), 0);
  const weekKcal = q.days.filter((d) => week.includes(d.date)).reduce((s, d) => s + d.activities.reduce((t, a) => t + (a.calories ?? 0), 0), 0);

  return (
    <Screen glow="fitness" refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <Header
        centered
        title="Fitness"
        left={<RoundButton onPress={() => setPicking(true)}><CalendarIcon size={20} color={colors.text} /></RoundButton>}
        right={<RoundButton onPress={() => setMenu("more")}><DotsIcon size={20} color={colors.text} /></RoundButton>}
      />
      <WeekStrip days={days} selected={selected} onSelect={setSelected} />

      <View style={styles.dayRow}>
        <Text style={styles.dayTitle}>{longDayLabel(selected)}</Text>
        <View style={styles.dayRight}>
          <Pressable style={styles.smallRound} onPress={() => setMenu("add")} accessibilityLabel="Add"><PlusIcon size={18} color={colors.text} /></Pressable>
        </View>
      </View>
      {day?.activities.length ? day.activities.map((a) => <WorkoutCard key={a.id} a={a} />) : (
        <Card>
          <Text style={styles.empty}>Rest day</Text>
        </Card>
      )}

      <SectionLabel title="Training load" />
      <View style={styles.gauges}>
        <Pressable onPress={() => router.push("/cardio-load")}>
        <Gauge
          title="Cardio"
          value={cardio ? Math.round(cardio.atl) : null}
          min={0}
          max={Math.max(40, Math.ceil((Math.max(cardio?.atl ?? 0, cardio?.optimal?.[1] ?? 30) * 1.4) / 10) * 10)}
          optimal={cardio?.optimal ? [Math.round(cardio.optimal[0]), Math.round(cardio.optimal[1])] : [0, 0]}
          status={cardio?.status ?? null}
          color={colors.cardio}
        />
        </Pressable>
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
      <Text style={styles.footnote}>Cardio: daily training impulse (TRIMP) averaged over the last week vs your 6-week base. Muscular: set-equivalents over 7 days, from lifting and cardio.</Text>

      <SectionLabel title="Cardio" />
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
        <Card style={styles.half} onPress={() => router.push("/fitness-models")}>
          <Text style={styles.cardTitle}>VO₂ max</Text>
          {vo2Value != null ? (
            <Text style={styles.cardValue}>{vo2Value.toFixed(1)}</Text>
          ) : (
            <Text style={styles.cardPending}>{models.isLoading ? "…" : "No estimate yet"}</Text>
          )}
          <Text style={styles.cardSub}>
            {vo2?.ours ? `Ours${vo2.coros ? ` · COROS ${vo2.coros.value}` : ""}` : vo2?.coros ? "COROS (ours needs FIT streams)" : "Needs runs with FIT streams"}
          </Text>
        </Card>
        <Card style={styles.half} onPress={hrr?.latest ? () => router.push(`/workout/${hrr.latest!.activity_id}`) : undefined}>
          <Text style={styles.cardTitle}>HR recovery</Text>
          {hrr?.latest ? (
            <Text style={styles.cardValue}>{hrr.latest.drop_bpm}<Text style={styles.cardUnit}> bpm</Text></Text>
          ) : (
            <Text style={styles.cardPending}>{models.isLoading ? "…" : "None yet"}</Text>
          )}
          <Text style={styles.cardSub}>
            {hrr?.latest
              ? `${hrr.latest.rating} · ${new Date(`${hrr.latest.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}${hrr.best && hrr.best.drop_bpm > hrr.latest.drop_bpm ? ` · best ${hrr.best.drop_bpm}` : ""}`
              : "Keep the watch recording for a minute after a hard effort"}
          </Text>
        </Card>
      </View>

      <SectionLabel title="Fitness models" />
      <Card onPress={() => router.push("/fitness-models")}>
        <View style={styles.modelsRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>VO₂max · threshold · HRmax · race times</Text>
            <Text style={styles.cardSub}>
              {models.data
                ? [
                    models.data.lthr ? `Threshold ${Math.round(models.data.lthr.value)} bpm` : null,
                    models.data.hr_max ? `max ${models.data.hr_max.value} bpm` : null,
                    (() => {
                      const r5 = models.data.races.find((r) => r.key === "race_5k");
                      return r5?.ours_s ? `5K ${clockDuration(r5.ours_s)}` : null;
                    })(),
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Our estimates next to COROS's"
                : "Our estimates next to COROS's"}
            </Text>
          </View>
          <ArrowRight size={16} color={colors.textMuted} />
        </View>
      </Card>

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
      <DatePickerSheet
        key={selected}
        visible={picking}
        onClose={() => setPicking(false)}
        value={selected}
        max={today}
        onChange={setSelected}
        marked={marked}
        title="Jump to a day"
      />
      <MenuSheet
        visible={menu === "more"}
        onClose={() => setMenu(null)}
        items={[
          { label: "Training zones", sub: "Heart rate and pace", icon: HeartIcon, color: colors.recoveryRed, onPress: () => router.push("/zones") },
          { label: "Fitness models", sub: "VO₂max, threshold, race predictions", icon: PulseIcon, color: colors.recovery, onPress: () => router.push("/fitness-models") },
          { label: "Race results", icon: RouteIcon, color: colors.cardio, onPress: () => router.push("/races") },
          { label: "Cardio load", icon: FlameIcon, color: colors.strain, onPress: () => router.push("/cardio-load") },
          { label: "Muscle groups", icon: DumbbellIcon, color: colors.muscular, onPress: () => router.push("/muscles") },
        ]}
      />
      <MenuSheet
        visible={menu === "add"}
        onClose={() => setMenu(null)}
        title="Add"
        items={[
          { label: "Log a lift", sub: "Sets, reps and weight", icon: DumbbellIcon, color: colors.muscular, onPress: () => router.push("/strength/log") },
          { label: "Race result", sub: "Calibrates VO₂max and predictions", icon: RouteIcon, color: colors.cardio, onPress: () => router.push("/races") },
        ]}
      />
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
  modelsRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)" },
  logText: { ...font.label, color: colors.text },
});
