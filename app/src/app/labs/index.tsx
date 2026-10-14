import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { CameraIcon, ChevronRight, DocIcon, PhotoIcon } from "@/components/icons";
import { RangeBar } from "@/components/RangeBar";
import { SectionLabel } from "@/components/SectionLabel";
import { MenuSheet } from "@/components/Sheet";
import { Surface } from "@/components/Surface";
import { api, errorText, type DocumentOut, type LabMarker } from "@/lib/api";
import { flagColor, flagLabel, groupBy, KIND_LABEL, labDate, shown } from "@/lib/labs";
import { useDocumentUpload } from "@/lib/upload";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

/** iOS won't present a picker while the menu sheet is still sliding away. */
const later = (fn: () => void) => setTimeout(fn, 450);

const STATUS_TEXT: Record<DocumentOut["status"], string> = {
  processing: "Reading…",
  review: "Ready to review",
  confirmed: "Saved",
  failed: "Couldn't read it",
};

function year(iso: string | null): string {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
}

function MarkerRow({ m }: { m: LabMarker }) {
  const v = shown(m);
  const color = flagColor(m.flag);
  const label = flagLabel(m.flag);
  return (
    <Pressable style={styles.marker} onPress={() => router.push(`/labs/${encodeURIComponent(m.analyte)}`)}>
      <View style={{ flex: 1 }}>
        <Text style={styles.markerName} numberOfLines={1}>{m.label}</Text>
        <Text style={styles.method}>
          {labDate(m.date)}
          {m.count > 1 ? ` · ${m.count} results` : ""}
          {label ? <Text style={{ color }}> · {label}</Text> : null}
        </Text>
      </View>
      <RangeBar value={v.num} lo={v.lo} hi={v.hi} color={color} width={70} />
      <View style={styles.markerVal}>
        <Text style={[styles.val, label ? { color } : null]} numberOfLines={1}>{v.value}</Text>
        <Text style={styles.unit} numberOfLines={1}>{v.unit}</Text>
      </View>
    </Pressable>
  );
}

function DocRow({ d }: { d: DocumentOut }) {
  const busy = d.status === "processing";
  const tone = d.status === "failed" ? colors.recoveryRed : d.status === "review" ? colors.recoveryAmber : colors.textFaint;
  return (
    <Pressable style={styles.doc} onPress={() => router.push(`/labs/doc/${d.id}`)}>
      <View style={styles.docIcon}><DocIcon size={18} color={colors.text} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.markerName} numberOfLines={1}>{d.title ?? d.files[0]?.name ?? "Document"}</Text>
        <Text style={styles.method} numberOfLines={1}>
          {[d.kind ? KIND_LABEL[d.kind] : null, d.provider, d.collected_on ? year(d.collected_on) : null].filter(Boolean).join(" · ") || d.files.map((f) => f.name).join(", ")}
        </Text>
        <Text style={[styles.method, { color: tone }]}>
          {STATUS_TEXT[d.status]}
          {d.status !== "processing" && d.result_count ? ` · ${d.result_count} results${d.flagged_count ? `, ${d.flagged_count} flagged` : ""}` : ""}
        </Text>
      </View>
      {busy ? <ActivityIndicator color={colors.textMuted} /> : <ChevronRight size={16} color={colors.textFaint} />}
    </Pressable>
  );
}

export default function LabsScreen() {
  const { upload: openUpload } = useLocalSearchParams<{ upload?: string }>();
  const [sheet, setSheet] = useState(Boolean(openUpload)); // the + menu links here with ?upload=1
  const up = useDocumentUpload();
  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: api.documents,
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "processing") ? 3000 : false),
  });
  const labs = useQuery({ queryKey: ["labs"], queryFn: api.labs });

  const all = docs.data ?? [];
  const pending = all.filter((d) => d.status !== "confirmed");
  const saved = all.filter((d) => d.status === "confirmed");
  const markers = labs.data?.markers ?? [];
  const flagged = markers.filter((m) => flagLabel(m.flag));

  return (
    <View style={styles.screen}>
      <Backdrop glow="green" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title="Labs" subtitle="Blood work and doctor's documents" />
        <View style={styles.body}>
          {docs.isError ? <Text style={styles.text}>Cannot reach the backend ({errorText(docs.error)})</Text> : null}

          <Pressable style={[styles.btn, up.pending && { opacity: 0.5 }]} disabled={up.pending} onPress={() => setSheet(true)}>
            {up.pending ? <ActivityIndicator color={colors.text} /> : <Text style={styles.btnText}>Add a document</Text>}
          </Pressable>
          {up.error ? <Text style={[styles.text, { color: colors.recoveryRed, marginTop: 8 }]}>{up.error}</Text> : null}

          {pending.length ? (
            <>
              <SectionLabel title="To review" />
              <Surface style={styles.card}>{pending.map((d) => <DocRow key={d.id} d={d} />)}</Surface>
            </>
          ) : null}

          {flagged.length ? (
            <>
              <SectionLabel title="Out of range" note="latest result" />
              <Surface style={styles.card}>{flagged.map((m) => <MarkerRow key={m.analyte} m={m} />)}</Surface>
            </>
          ) : null}

          {groupBy(markers, (m) => m.category).map(([cat, ms]) => (
            <React.Fragment key={cat}>
              <SectionLabel title={cat} />
              <Surface style={styles.card}>{ms.map((m) => <MarkerRow key={m.analyte} m={m} />)}</Surface>
            </React.Fragment>
          ))}

          {!markers.length && !pending.length && !docs.isLoading ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>No results yet</Text>
              <Text style={styles.text}>
                Add a lab report as a PDF, or photograph a paper one page by page. Claude reads it into results with units and reference ranges; you check them before anything is saved, and each marker then gets a history across reports.
              </Text>
            </Surface>
          ) : null}

          {saved.length ? (
            <>
              <SectionLabel title="Documents" />
              <Surface style={styles.card}>{saved.map((d) => <DocRow key={d.id} d={d} />)}</Surface>
            </>
          ) : null}

          <Text style={styles.footer}>
            Documents are read by Claude (Anthropic&apos;s API) with your server&apos;s key and stored only on your server. Values are converted to one unit per marker so reports from different labs line up; the method is shown on each result.
          </Text>
        </View>
      </ScrollView>
      <MenuSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Add a document"
        items={[
          { label: "PDF or file", sub: "A lab report from email or the lab's portal", icon: DocIcon, onPress: () => later(() => up.upload("file")) },
          { label: "Photos", sub: "Pages of one document, in order", icon: PhotoIcon, onPress: () => later(() => up.upload("library")) },
          { label: "Take a photo", sub: "A one-page paper document", icon: CameraIcon, onPress: () => later(() => up.upload("camera")) },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  card: { marginBottom: spacing.md, gap: 14 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  method: { ...font.caption, color: colors.textFaint },
  btn: { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: radius.pill, paddingVertical: 13, alignItems: "center", marginBottom: spacing.sm },
  btnText: { ...font.heading, fontSize: 15, color: colors.text },
  marker: { flexDirection: "row", alignItems: "center", gap: 12 },
  markerName: { ...font.heading, fontSize: 15, color: colors.text },
  markerVal: { width: 74, alignItems: "flex-end" },
  val: { fontFamily: fonts.numeral, fontSize: 20, color: colors.text },
  unit: { ...font.caption, fontSize: 10, color: colors.textFaint },
  doc: { flexDirection: "row", alignItems: "center", gap: 12 },
  docIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.07)", alignItems: "center", justifyContent: "center" },
  footer: { ...font.caption, color: colors.textFaint, textAlign: "center", lineHeight: 17, marginTop: spacing.sm },
});
