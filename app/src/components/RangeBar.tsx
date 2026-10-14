import React from "react";
import { StyleSheet, View } from "react-native";

import { rangeLayout } from "@/lib/labs";
import { colors } from "@/theme/tokens";

/** A value against its reference range: a faint track, the normal band in mint, and a dot. */
export function RangeBar({ value, lo, hi, color, width = 96 }: { value: number | null; lo: number | null; hi: number | null; color: string; width?: number }) {
  const l = rangeLayout(value, lo, hi);
  if (!l) return <View style={{ width }} />;
  return (
    <View style={[styles.track, { width }]}>
      <View style={[styles.band, { left: `${l.band[0] * 100}%`, width: `${(l.band[1] - l.band[0]) * 100}%` }]} />
      {l.dot != null ? <View style={[styles.dot, { left: `${l.dot * 100}%`, backgroundColor: color }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.07)", justifyContent: "center" },
  band: { position: "absolute", top: 0, bottom: 0, borderRadius: 3, backgroundColor: "rgba(46,230,166,0.35)" },
  dot: { position: "absolute", width: 10, height: 10, borderRadius: 5, marginLeft: -5, borderWidth: 2, borderColor: colors.bg },
});
