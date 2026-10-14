/** Biological age: per-input contribution bars, shared by the Biology card and its detail screen. */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, font, fonts } from "@/theme/tokens";

export const BIO_LABEL: Record<string, string> = {
  vo2max: "VO₂max",
  rhr: "Resting HR",
  hrv: "HRV",
  body: "Body composition",
  sleep: "Sleep",
  activity: "Activity",
};

export function signed(v: number, digits = 1): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
}

export function toneOf(v: number): string {
  return v < 0 ? colors.recovery : v > 0 ? colors.recoveryRed : colors.textMuted;
}

/** Bars grow left (years removed, mint) or right (years added, red) from a centre line. */
export function ContributionBars({ contributions }: { contributions: Record<string, number> }) {
  const rows = Object.entries(contributions).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const scale = Math.max(1, ...rows.map(([, v]) => Math.abs(v)));
  return (
    <View style={{ gap: 8 }}>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={styles.label}>{BIO_LABEL[k] ?? k}</Text>
          <View style={styles.track}>
            <View style={styles.mid} />
            <View
              style={[
                styles.bar,
                { width: `${(Math.abs(v) / scale) * 50}%`, backgroundColor: v < 0 ? colors.recovery : colors.recoveryRed },
                v < 0 ? { right: "50%" } : { left: "50%" },
              ]}
            />
          </View>
          <Text style={[styles.val, { color: toneOf(v) }]}>{signed(v)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  label: { ...font.caption, color: colors.textMuted, width: 112 },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.05)" },
  mid: { position: "absolute", left: "50%", top: -2, width: 1, height: 10, backgroundColor: "rgba(255,255,255,0.18)" },
  bar: { position: "absolute", top: 0, height: 6, borderRadius: 3 },
  val: { fontFamily: fonts.numeral, fontSize: 13, width: 36, textAlign: "right" },
});
