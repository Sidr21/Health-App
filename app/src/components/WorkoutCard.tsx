import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { Card } from "@/components/Card";
import { ArrowRight, FlameIcon, RouteIcon } from "@/components/icons";
import type { DayPayload } from "@/lib/api";
import { km } from "@/lib/format";
import { sportMeta } from "@/lib/sport";
import { colors, font, spacing } from "@/theme/tokens";

type Activity = DayPayload["activities"][number];

function MiniRing({ pct, color }: { pct: number | null; color: string }) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14">
      <Circle cx={7} cy={7} r={r} stroke={colors.hairline} strokeWidth={2.2} fill="none" />
      {pct != null ? (
        <Circle cx={7} cy={7} r={r} stroke={color} strokeWidth={2.2} fill="none" strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.min(1, pct / 100))} transform="rotate(-90 7 7)" strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}

/** "7:43 PM · Outdoor Run · ◔44% · 3.76 mi · 502 kcal →" card from Bevel's Fitness tab. */
export function WorkoutCard({ a }: { a: Activity }) {
  const meta = sportMeta(a.sport_code, a.sport);
  const time = new Date(a.start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const strainPct = a.coros_training_load != null ? Math.min(100, Math.round((a.coros_training_load / 200) * 100)) : null;
  return (
    <Card style={styles.card} onPress={() => router.push(`/workout/${a.id}`)}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: `${meta.color}26` }]}>
          <meta.Icon size={24} color={meta.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.time}>{time}</Text>
          <Text style={styles.name}>{meta.name}</Text>
          <View style={styles.metaRow}>
            {strainPct != null ? (
              <View style={styles.metaItem}>
                <MiniRing pct={strainPct} color={colors.strain} />
                <Text style={styles.meta}>{strainPct}%</Text>
              </View>
            ) : null}
            {a.distance_m != null ? (
              <View style={styles.metaItem}>
                <RouteIcon size={13} color={colors.textMuted} />
                <Text style={styles.meta}>{km(a.distance_m)}</Text>
              </View>
            ) : null}
            {a.calories != null ? (
              <View style={styles.metaItem}>
                <FlameIcon size={13} color={colors.textMuted} />
                <Text style={styles.meta}>{a.calories} kcal</Text>
              </View>
            ) : null}
          </View>
        </View>
        <ArrowRight size={18} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  time: { ...font.caption, color: colors.textMuted },
  name: { ...font.heading, fontSize: 18, color: colors.text, marginTop: 1 },
  metaRow: { flexDirection: "row", gap: 12, marginTop: 4 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  meta: { ...font.label, color: colors.textMuted },
});
