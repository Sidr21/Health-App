import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/Card";
import { Header, RoundButton } from "@/components/Header";
import { DotsIcon } from "@/components/icons";
import { Screen } from "@/components/Screen";
import { SectionLabel } from "@/components/SectionLabel";
import { Sparkline } from "@/components/Sparkline";
import { hms } from "@/lib/format";
import { useDays } from "@/lib/useDays";
import { colors, font, fonts } from "@/theme/tokens";

function Tile({ title, value, unit, series, color, sub }: { title: string; value: string; unit?: string; series: (number | null)[]; color: string; sub?: string }) {
  return (
    <Card style={styles.half}>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileValue}>
        {value}
        {unit ? <Text style={styles.tileUnit}> {unit}</Text> : null}
      </Text>
      {sub ? <Text style={styles.tileSub}>{sub}</Text> : null}
      <View style={{ marginTop: 8 }}>
        <Sparkline values={series} color={color} width={130} height={40} />
      </View>
    </Card>
  );
}

export default function BiologyScreen() {
  const q = useDays(28);
  const latest = q.days[q.days.length - 1];
  const comps = (latest?.scores.recovery?.components ?? {}) as { hrv_ms?: number };
  return (
    <Screen refreshing={q.isFetching} onRefresh={() => q.refetch()}>
      <Header centered title="Biology" left={<View style={{ width: 44 }} />} right={<RoundButton><DotsIcon size={20} color={colors.text} /></RoundButton>} />
      <SectionLabel title="Vitals" note="last 28 days" />
      <View style={styles.grid}>
        <Tile title="Resting HRV" value={comps.hrv_ms != null ? comps.hrv_ms.toFixed(0) : "–"} unit="ms" series={q.days.map((d) => ((d.scores.recovery?.components as { hrv_ms?: number } | null)?.hrv_ms ?? null))} color={colors.recovery} />
        <Tile title="Resting HR" value={latest?.daily.rhr != null ? String(latest.daily.rhr) : "–"} unit="bpm" series={q.days.map((d) => d.daily.rhr)} color={colors.cardio} />
        <Tile title="Sleep HR" value={latest?.sleep?.hr_avg != null ? String(latest.sleep.hr_avg) : "–"} unit="bpm" series={q.days.map((d) => d.sleep?.hr_avg ?? null)} color={colors.sleep} />
        <Tile title="Stress" value={latest?.daily.stress_avg != null ? String(latest.daily.stress_avg) : "–"} series={q.days.map((d) => d.daily.stress_avg)} color={colors.stress} sub="daily average" />
        <Tile title="Time asleep" value={hms(latest?.sleep?.asleep_s)} series={q.days.map((d) => (d.sleep?.asleep_s != null ? d.sleep.asleep_s / 3600 : null))} color={colors.sleepDeep} />
        <Tile title="Steps" value={latest?.daily.steps != null ? latest.daily.steps.toLocaleString() : "–"} series={q.days.map((d) => d.daily.steps)} color={colors.energy} />
      </View>
      <SectionLabel title="Body" />
      <Card>
        <Text style={styles.body}>Weight, BMI and body fat appear here once Apple Health is connected on the native build.</Text>
      </Card>
      <SectionLabel title="Biological age" />
      <Card>
        <Text style={styles.body}>Weekly, from VO₂max, resting HR, HRV, body composition, sleep and activity (DESIGN §6.8). Needs the fitness models from phase 3.</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  half: { width: "48.5%" },
  tileTitle: { ...font.overline, fontSize: 11, color: colors.textMuted },
  tileValue: { ...font.number, fontSize: 28, color: colors.text, marginTop: 6 },
  tileUnit: { fontSize: 13, color: colors.textMuted, fontFamily: fonts.label },
  tileSub: { ...font.caption, color: colors.textFaint },
  body: { ...font.body, color: colors.textMuted, lineHeight: 21 },
});
