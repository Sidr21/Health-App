import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { LineChart } from "@/components/Charts";
import { DetailHeader } from "@/components/DetailHeader";
import { ChevronRight } from "@/components/icons";
import { RangeBar } from "@/components/RangeBar";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api, errorText } from "@/lib/api";
import { chartDomain, delta, flagColor, flagLabel, fmtNum, rangeText, shown } from "@/lib/labs";
import { colors, font, fonts, spacing } from "@/theme/tokens";

function monthYear(iso: string | null): string {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "undated";
}

function fullDate(iso: string | null): string {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "undated";
}

export default function LabMarkerScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const analyte = decodeURIComponent(key ?? "");
  const q = useQuery({ queryKey: ["lab", analyte], queryFn: () => api.labHistory(analyte) });
  const h = q.data;
  const rows = h?.results ?? [];
  const latest = rows[rows.length - 1];
  const v = latest ? shown(latest) : null;
  const before = rows.length > 1 ? shown(rows[rows.length - 2]) : null;
  const color = flagColor(latest?.flag);
  const label = flagLabel(latest?.flag);
  const numeric = rows.filter((r) => shown(r).num != null);
  const points = numeric.map((r, i) => ({ x: i, y: shown(r).num }));
  // the most recent range is the one the lab applies now
  const lo = v?.lo ?? null;
  const hi = v?.hi ?? null;
  const range = rangeText(lo, hi);

  return (
    <View style={styles.screen}>
      <Backdrop glow="green" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title={h?.label ?? "Marker"} subtitle={h?.category} />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.text}>Cannot load this marker ({errorText(q.error)})</Text> : null}

          {latest && v ? (
            <Surface style={styles.hero}>
              <Text style={styles.overline}>LATEST · {fullDate(latest.date).toUpperCase()}</Text>
              <Text style={[styles.big, label ? { color } : null]}>
                {v.value}
                <Text style={styles.unit}> {v.unit}</Text>
              </Text>
              <RangeBar value={v.num} lo={lo} hi={hi} color={color} width={240} />
              <Text style={styles.text}>
                {range ? `Normal ${range} ${v.unit}` : latest.ref_text ?? "No reference range printed"}
                {label ? <Text style={{ color }}> · {label}</Text> : null}
                {before && delta(v.num, before.num) ? ` · ${delta(v.num, before.num)} since ${monthYear(rows[rows.length - 2].date)}` : ""}
              </Text>
            </Surface>
          ) : null}

          {points.length > 1 ? (
            <>
              <SectionLabel title="History" note={`${numeric.length} results`} />
              <Surface style={styles.card}>
                <LineChart
                  id="lab-history"
                  points={points}
                  color={colors.recovery}
                  dots
                  height={170}
                  domain={chartDomain(points.map((p) => p.y as number), lo, hi)}
                  bands={lo != null || hi != null ? [{ lo: lo ?? 0, hi: hi ?? (lo ?? 0) * 2, color: colors.recovery }] : undefined}
                  xLabels={[monthYear(numeric[0].date), monthYear(numeric[numeric.length - 1].date)]}
                  yFormat={fmtNum}
                />
                <Text style={styles.text}>The shaded band is the latest report&apos;s normal range. Points are evenly spaced, one per result.</Text>
              </Surface>
            </>
          ) : null}

          <SectionLabel title="Results" />
          <Surface style={styles.card}>
            {[...rows].reverse().map((r) => {
              const s = shown(r);
              const fl = flagLabel(r.flag);
              return (
                <Pressable key={r.id} style={styles.row} onPress={() => router.push(`/labs/doc/${r.document_id}`)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{fullDate(r.date)}</Text>
                    <Text style={styles.method} numberOfLines={1}>
                      {r.name}
                      {fl ? <Text style={{ color: flagColor(r.flag) }}> · {fl}</Text> : null}
                    </Text>
                    {r.method && r.method !== "as printed" && r.value != null ? (
                      <Text style={styles.method}>printed {fmtNum(r.value)} {r.unit}</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.val, fl ? { color: flagColor(r.flag) } : null]}>
                    {s.value}
                    <Text style={styles.unit}> {s.unit}</Text>
                  </Text>
                  <ChevronRight size={14} color={colors.textFaint} />
                </Pressable>
              );
            })}
          </Surface>
          {h && !h.results.length ? <Text style={styles.text}>No saved results for this marker yet.</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { marginBottom: spacing.md, gap: 10, alignItems: "center", paddingVertical: spacing.lg },
  overline: { ...font.overline, fontSize: 10, color: colors.textFaint },
  big: { fontFamily: fonts.numeral, fontSize: 52, color: colors.text },
  card: { marginBottom: spacing.md, gap: 12 },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17, textAlign: "center" },
  method: { ...font.caption, color: colors.textFaint },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: { ...font.heading, fontSize: 15, color: colors.text },
  val: { fontFamily: fonts.numeral, fontSize: 19, color: colors.text },
  unit: { ...font.caption, fontSize: 11, color: colors.textFaint },
});
