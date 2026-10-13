import { useQuery } from "@tanstack/react-query";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Surface } from "@/components/Surface";
import { api, type InsightEffect, type InsightsOut } from "@/lib/api";
import { TAG_BY_KEY, TAGS, tagLabel } from "@/lib/journal";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

const MIN_EACH = 5;

function EffectCard({ e, outcomes }: { e: InsightEffect; outcomes: InsightsOut["outcomes"] }) {
  const o = outcomes[e.metric];
  const tone = e.good == null ? colors.textMuted : e.good ? colors.recovery : colors.recoveryRed;
  const yesLabel = e.kind === "boolean" ? "Yes" : e.split.split(" vs ")[0];
  const noLabel = e.kind === "boolean" ? "No" : e.split.split(" vs ")[1];
  const max = Math.max(e.mean_yes ?? 0, e.mean_no ?? 0, 1);
  const sign = (e.diff ?? 0) > 0 ? "+" : "";
  return (
    <Surface style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.emoji}>{TAG_BY_KEY[e.tag]?.emoji ?? "•"}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{tagLabel(e.tag)} → {o.label}</Text>
          <Text style={styles.sub}>{e.strength === "clear" ? "Clear pattern" : "Possible pattern"} · {e.n_yes} vs {e.n_no} nights</Text>
        </View>
        <Text style={[styles.delta, { color: tone }]}>{sign}{e.diff}{o.unit === "%" ? "" : ` ${o.unit}`}</Text>
      </View>
      {[
        { label: yesLabel, v: e.mean_yes, c: tone },
        { label: noLabel, v: e.mean_no, c: colors.textFaint },
      ].map((row) => (
        <View key={row.label} style={styles.barRow}>
          <Text style={styles.barLabel}>{row.label}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(100 * (row.v ?? 0)) / max}%`, backgroundColor: row.c }]} />
          </View>
          <Text style={styles.barVal}>{row.v ?? "–"}</Text>
        </View>
      ))}
      <Text style={styles.sub}>
        Next-morning {o.label.toLowerCase()} {e.good ? "is better" : "is worse"} after {e.kind === "boolean" ? `${tagLabel(e.tag).toLowerCase()} days` : `${e.split.split(" vs ")[0]} days`}.
      </Text>
    </Surface>
  );
}

export default function InsightsScreen() {
  const q = useQuery({ queryKey: ["insights"], queryFn: () => api.insights(90) });
  const d = q.data;
  const found = d?.effects.filter((e) => e.strength === "clear" || e.strength === "possible") ?? [];
  const flat = d?.effects.filter((e) => e.strength === "none") ?? [];
  // per tag, how far it is from the minimum sample (best metric)
  const progress = new Map<string, { yes: number; no: number }>();
  for (const e of d?.effects ?? []) {
    if (e.strength !== "need_more") continue;
    const p = progress.get(e.tag) ?? { yes: 0, no: 0 };
    progress.set(e.tag, { yes: Math.max(p.yes, e.n_yes), no: Math.max(p.no, e.n_no) });
  }
  if (d) for (const t of TAGS) if (!progress.has(t.key)) progress.set(t.key, { yes: 0, no: 0 });
  for (const e of [...found, ...flat]) progress.delete(e.tag);

  return (
    <View style={styles.screen}>
      <Backdrop glow="home" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Insights" subtitle="Last 90 days" />
        <View style={styles.body}>
          <Surface style={styles.hero} radiusSize={radius.lg}>
            <Text style={styles.heroNum}>{d?.logged_days ?? "–"}</Text>
            <Text style={styles.heroLabel}>days logged</Text>
            <Text style={styles.heroText}>
              Each habit is compared with the next morning&apos;s recovery, sleep score, HRV and resting HR. A pattern needs at least {MIN_EACH} days with it and {MIN_EACH} without.
            </Text>
          </Surface>

          {q.isError ? <Text style={styles.sub}>Cannot reach the backend ({String(q.error)})</Text> : null}

          {found.length ? (
            <>
              <SectionLabel title="Patterns" note={`${found.length} found`} />
              {found.map((e) => (
                <EffectCard key={`${e.tag}-${e.metric}`} e={e} outcomes={d!.outcomes} />
              ))}
            </>
          ) : d ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>No patterns yet</Text>
              <Text style={styles.sub}>Keep logging. Patterns show up here once a habit has enough days on both sides.</Text>
            </Surface>
          ) : null}

          {progress.size ? (
            <>
              <SectionLabel title="Collecting data" />
              <Surface style={styles.card}>
                {[...progress.entries()].map(([tag, p]) => (
                  <View key={tag} style={styles.progRow}>
                    <Text style={styles.emoji}>{TAG_BY_KEY[tag]?.emoji ?? "•"}</Text>
                    <Text style={styles.progName}>{tagLabel(tag)}</Text>
                    {[p.yes, p.no].map((n, i) => (
                      <View key={i} style={styles.progCell}>
                        <View style={styles.pips}>
                          {Array.from({ length: MIN_EACH }, (_, k) => (
                            <View key={k} style={[styles.pip, k < n && { backgroundColor: i === 0 ? colors.recovery : colors.textMuted }]} />
                          ))}
                        </View>
                        <Text style={styles.progLabel}>{i === 0 ? "with" : "without"} {Math.min(n, MIN_EACH)}/{MIN_EACH}</Text>
                      </View>
                    ))}
                  </View>
                ))}
              </Surface>
            </>
          ) : null}

          {flat.length ? (
            <>
              <SectionLabel title="No clear effect" />
              <Surface style={styles.card}>
                {flat.slice(0, 8).map((e) => (
                  <View key={`${e.tag}-${e.metric}`} style={styles.flatRow}>
                    <Text style={styles.flatName}>{tagLabel(e.tag)} → {d!.outcomes[e.metric].label}</Text>
                    <Text style={styles.flatVal}>{(e.diff ?? 0) > 0 ? "+" : ""}{e.diff} · {e.n_yes}/{e.n_no}</Text>
                  </View>
                ))}
              </Surface>
            </>
          ) : null}

          {d ? <Text style={styles.method}>Method: {d.method}.</Text> : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  hero: { alignItems: "center", paddingVertical: spacing.xl, marginBottom: spacing.sm },
  heroNum: { fontFamily: fonts.numeral, fontSize: 56, color: colors.text },
  heroLabel: { ...font.overline, color: colors.textMuted },
  heroText: { ...font.body, color: colors.textMuted, textAlign: "center", marginTop: spacing.md, lineHeight: 21 },
  card: { marginBottom: spacing.md, gap: 8 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  emoji: { fontSize: 20 },
  sub: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  delta: { fontFamily: fonts.numeral, fontSize: 24 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barLabel: { ...font.label, color: colors.textMuted, width: 72 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.06)", overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  barVal: { fontFamily: fonts.numeral, fontSize: 15, color: colors.text, width: 40, textAlign: "right" },
  progRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  progName: { ...font.label, color: colors.text, flex: 1 },
  progCell: { alignItems: "flex-end", width: 74 },
  pips: { flexDirection: "row", gap: 3 },
  pip: { width: 10, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)" },
  progLabel: { ...font.caption, fontSize: 10, color: colors.textFaint, marginTop: 3 },
  flatRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  flatName: { ...font.label, color: colors.textMuted },
  flatVal: { fontFamily: fonts.numeral, fontSize: 14, color: colors.textFaint },
  method: { ...font.caption, color: colors.textFaint, marginTop: spacing.md, lineHeight: 17 },
});
