import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { Backdrop } from "@/components/Backdrop";
import { DetailHeader } from "@/components/DetailHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { MenuSheet, SheetFrame } from "@/components/Sheet";
import { Surface } from "@/components/Surface";
import { api, errorText, type LabResultOut } from "@/lib/api";
import { flagColor, flagLabel, fmtNum, groupBy, KIND_LABEL, rangeText, shown } from "@/lib/labs";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

function longDate(iso: string | null): string | null {
  return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : null;
}

function ResultRow({ r, onToggle, onEdit }: { r: LabResultOut; onToggle: () => void; onEdit: () => void }) {
  const v = shown(r);
  const label = flagLabel(r.flag);
  const color = flagColor(r.flag);
  const converted = r.value_std != null && r.method !== "as printed" && r.value != null;
  const range = rangeText(v.lo, v.hi);
  return (
    <View style={[styles.row, !r.included && { opacity: 0.4 }]}>
      <Pressable onPress={onToggle} hitSlop={8} style={[styles.check, r.included && styles.checkOn]} accessibilityLabel={r.included ? "Exclude" : "Include"}>
        {r.included ? <Text style={styles.tick}>✓</Text> : null}
      </Pressable>
      <Pressable style={{ flex: 1, gap: 2 }} onPress={onEdit}>
        <View style={styles.rowHead}>
          <Text style={styles.name} numberOfLines={2}>{r.name}</Text>
          <Text style={[styles.val, label ? { color } : null]}>
            {v.value}
            <Text style={styles.unit}> {v.unit}</Text>
          </Text>
        </View>
        <Text style={styles.method}>
          {r.known ? r.label : "Kept, not charted"}
          {range ? ` · normal ${range}` : r.ref_text ? ` · ${r.ref_text}` : ""}
          {label ? <Text style={{ color }}> · {label}{r.flag_source === "range" ? " (by range)" : ""}</Text> : null}
        </Text>
        {converted ? <Text style={styles.method}>printed {fmtNum(r.value!)} {r.unit} · {r.method}</Text> : null}
        {r.issue ? <Text style={[styles.method, { color: colors.recoveryAmber }]}>⚠ {r.issue}</Text> : null}
      </Pressable>
    </View>
  );
}

function EditSheet({ r, docId, onClose }: { r: LabResultOut | null; docId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(r?.value != null ? String(r.value) : "");
  const [unit, setUnit] = useState(r?.unit ?? "");
  const save = useMutation({
    mutationFn: () => api.patchLabResult(docId, r!.id, { value: Number(value), unit: unit.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["document", docId] });
      onClose();
    },
  });
  const ok = value.trim() !== "" && Number.isFinite(Number(value));
  return (
    <SheetFrame visible={r != null} onClose={onClose} title={r ? `Correct ${r.name}` : undefined}>
      <Text style={[styles.text, { marginBottom: spacing.sm }]}>
        Fix a number or unit the reader got wrong{r?.page ? ` (it's on page ${r.page})` : ""}. The converted value and flag are worked out again.
      </Text>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Value</Text>
        <TextInput value={value} onChangeText={(t) => setValue(t.replace(/[^0-9.\-]/g, ""))} keyboardType="decimal-pad" style={styles.input} placeholderTextColor={colors.textFaint} />
      </View>
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Unit</Text>
        <TextInput value={unit} onChangeText={setUnit} autoCapitalize="none" style={styles.input} placeholder="as printed" placeholderTextColor={colors.textFaint} />
      </View>
      <Pressable style={[styles.btn, { marginTop: spacing.sm }, (!ok || save.isPending) && { opacity: 0.4 }]} disabled={!ok || save.isPending} onPress={() => save.mutate()}>
        <Text style={styles.btnText}>{save.isPending ? "Saving…" : "Save correction"}</Text>
      </Pressable>
      {save.isError ? <Text style={[styles.text, { color: colors.recoveryRed }]}>{errorText(save.error)}</Text> : null}
    </SheetFrame>
  );
}

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const docId = Number(id);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LabResultOut | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const q = useQuery({
    queryKey: ["document", docId],
    queryFn: () => api.document(docId),
    refetchInterval: (query) => (query.state.data?.status === "processing" ? 3000 : false),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["document", docId] });
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["labs"] });
  };
  const toggle = useMutation({
    mutationFn: (r: LabResultOut) => api.patchLabResult(docId, r.id, { included: !r.included }),
    onSuccess: refresh,
  });
  const confirm = useMutation({ mutationFn: () => api.confirmDocument(docId), onSuccess: refresh });
  const retry = useMutation({ mutationFn: () => api.retryDocument(docId), onSuccess: refresh });
  const del = useMutation({
    mutationFn: () => api.deleteDocument(docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
      qc.invalidateQueries({ queryKey: ["labs"] });
      router.back();
    },
  });

  const d = q.data;
  const results = d?.results ?? [];
  const included = results.filter((r) => r.included).length;
  const subtitle = d ? [d.kind ? KIND_LABEL[d.kind] : null, longDate(d.collected_on)].filter(Boolean).join(" · ") : undefined;
  const busy = confirm.isPending || retry.isPending || del.isPending;
  const err = [toggle, confirm, retry, del].find((m) => m.isError)?.error;

  return (
    <View style={styles.screen}>
      <Backdrop glow="green" />
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        <DetailHeader title={d?.title ?? "Document"} subtitle={subtitle} />
        <View style={styles.body}>
          {q.isError ? <Text style={styles.text}>Cannot load the document ({errorText(q.error)})</Text> : null}

          {d?.status === "processing" ? (
            <Surface style={[styles.card, { alignItems: "center", paddingVertical: spacing.xl }]}>
              <ActivityIndicator color={colors.text} />
              <Text style={styles.cardTitle}>Reading {d.files.length > 1 ? `${d.files.length} pages` : "the document"}…</Text>
              <Text style={[styles.text, { textAlign: "center" }]}>Usually under a minute; a long report can take two or three. You can leave this screen.</Text>
            </Surface>
          ) : null}

          {d?.status === "failed" ? (
            <Surface style={styles.card}>
              <Text style={styles.cardTitle}>Couldn&apos;t read it</Text>
              <Text style={[styles.text, { color: colors.recoveryRed }]}>{d.error}</Text>
              <Pressable style={styles.btn} disabled={busy} onPress={() => retry.mutate()}>
                <Text style={styles.btnText}>Try again</Text>
              </Pressable>
            </Surface>
          ) : null}

          {d && (d.status === "review" || d.status === "confirmed") ? (
            <>
              <Surface style={styles.card}>
                {d.provider ? <Text style={styles.overline}>{d.provider.toUpperCase()}</Text> : null}
                <Text style={styles.summary}>{d.summary}</Text>
                {d.status === "review" ? (
                  <Text style={styles.text}>
                    Check the values against the document. Untick anything that isn&apos;t yours or isn&apos;t right, tap a row to correct it, then save. Nothing is added to your history until you do.
                  </Text>
                ) : (
                  <Text style={styles.text}>Saved to your history{d.collected_on ? ` for ${longDate(d.collected_on)}` : ""}.</Text>
                )}
              </Surface>

              {(d.notes ?? []).length ? (
                <>
                  <SectionLabel title="Notes" />
                  <Surface style={styles.card}>
                    {d.notes!.map((n, i) => (
                      <View key={i} style={{ gap: 2 }}>
                        <Text style={styles.name}>{n.title}</Text>
                        <Text style={styles.text}>{n.text}</Text>
                      </View>
                    ))}
                  </Surface>
                </>
              ) : null}

              {groupBy(results, (r) => r.panel ?? "Results").map(([panel, rows]) => (
                <React.Fragment key={panel}>
                  <SectionLabel title={panel} note={`${rows.length}`} />
                  <Surface style={styles.card}>
                    {rows.map((r) => (
                      <ResultRow key={r.id} r={r} onToggle={() => toggle.mutate(r)} onEdit={() => setEditing(r)} />
                    ))}
                  </Surface>
                </React.Fragment>
              ))}

              {!results.length ? (
                <Surface style={styles.card}>
                  <Text style={styles.text}>No measured values in this document{(d.notes ?? []).length ? "; the notes above are kept with it" : ""}.</Text>
                </Surface>
              ) : null}

              {d.status === "review" ? (
                <Pressable style={[styles.btn, styles.primary, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => confirm.mutate()}>
                  <Text style={[styles.btnText, { color: colors.bg }]}>{results.length ? `Save ${included} result${included === 1 ? "" : "s"}` : "Save document"}</Text>
                </Pressable>
              ) : null}
              <Pressable style={[styles.btnGhost, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => retry.mutate()}>
                <Text style={styles.btnGhostText}>Read it again</Text>
              </Pressable>
            </>
          ) : null}

          {d && d.status !== "processing" ? (
            <Pressable style={[styles.btnGhost, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => setConfirmDelete(true)}>
              <Text style={[styles.btnGhostText, { color: colors.recoveryRed }]}>Delete document</Text>
            </Pressable>
          ) : null}
          {err ? <Text style={[styles.text, { color: colors.recoveryRed, marginTop: 8 }]}>{errorText(err)}</Text> : null}

          {d?.usage ? (
            <Text style={styles.footer}>
              Read by {d.model} · {Math.round(d.usage.input_tokens / 1000)}k tokens in, {Math.round(d.usage.output_tokens / 1000)}k out · {d.files.map((f) => f.name).join(", ")}
            </Text>
          ) : null}
        </View>
      </ScrollView>
      <EditSheet key={editing?.id ?? "none"} r={editing} docId={docId} onClose={() => setEditing(null)} />
      <MenuSheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this document?"
        items={[
          { label: "Delete document and its results", sub: "Removes the file from your server too", color: colors.recoveryRed, onPress: () => del.mutate() },
          { label: "Keep it", onPress: () => {} },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: spacing.lg },
  card: { marginBottom: spacing.md, gap: 12 },
  cardTitle: { ...font.heading, fontSize: 15, color: colors.text },
  overline: { ...font.overline, fontSize: 10, color: colors.textFaint },
  summary: { ...font.body, color: colors.text, lineHeight: 21 },
  text: { ...font.caption, color: colors.textMuted, lineHeight: 17 },
  method: { ...font.caption, color: colors.textFaint },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  name: { ...font.heading, fontSize: 15, color: colors.text, flex: 1 },
  val: { fontFamily: fonts.numeral, fontSize: 19, color: colors.text },
  unit: { ...font.caption, fontSize: 11, color: colors.textFaint },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.hairline, alignItems: "center", justifyContent: "center", marginTop: 1 },
  checkOn: { backgroundColor: colors.recovery, borderColor: colors.recovery },
  tick: { color: colors.bg, fontSize: 13, fontWeight: "700" },
  btn: { backgroundColor: "rgba(255,255,255,0.10)", borderRadius: radius.pill, paddingVertical: 13, alignItems: "center" },
  primary: { backgroundColor: colors.recovery, marginBottom: spacing.sm },
  btnText: { ...font.heading, fontSize: 15, color: colors.text },
  btnGhost: { borderRadius: radius.pill, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: colors.hairline, marginBottom: spacing.sm },
  btnGhostText: { ...font.label, color: colors.textMuted },
  field: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  fieldLabel: { ...font.heading, fontSize: 15, color: colors.text, flex: 1 },
  input: { width: 170, height: 42, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.hairline, backgroundColor: "rgba(0,0,0,0.25)", color: colors.text, textAlign: "center", fontFamily: fonts.numeral, fontSize: 17 },
  footer: { ...font.caption, color: colors.textFaint, textAlign: "center", lineHeight: 17, marginTop: spacing.sm },
});
