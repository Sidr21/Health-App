/** Bottom sheets: an action menu (⋯ and + buttons) and a month calendar for picking a day. */
import React, { useState, type ComponentType } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChevronLeft } from "@/components/icons";
import type { IconProps } from "@/components/icons";
import { colors, font, fonts, radius, spacing } from "@/theme/tokens";

/** The bottom-sheet chrome: scrim, grabber and title. Sheets with text inputs lift above the keyboard. */
export function SheetFrame({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.md) + spacing.sm }]}>
          <View style={styles.grabber} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface MenuItem {
  label: string;
  sub?: string;
  icon?: ComponentType<IconProps>;
  color?: string;
  selected?: boolean;
  onPress: () => void;
}

export function MenuSheet({ visible, onClose, title, items }: { visible: boolean; onClose: () => void; title?: string; items: MenuItem[] }) {
  return (
    <SheetFrame visible={visible} onClose={onClose} title={title}>
      {items.map((it) => (
        <Pressable
          key={it.label}
          style={({ pressed }) => [styles.item, pressed && { backgroundColor: "rgba(255,255,255,0.05)" }]}
          onPress={() => {
            onClose();
            it.onPress();
          }}
        >
          {it.icon ? (
            <View style={[styles.itemIcon, { backgroundColor: `${it.color ?? colors.textMuted}22` }]}>
              <it.icon size={18} color={it.color ?? colors.text} />
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.itemLabel}>{it.label}</Text>
            {it.sub ? <Text style={styles.itemSub}>{it.sub}</Text> : null}
          </View>
          {it.selected ? <View style={styles.check} /> : null}
        </Pressable>
      ))}
    </SheetFrame>
  );
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first.getDay() }, () => null);
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** Month calendar; days after `max` are disabled; `marked` days get a dot (e.g. workouts). */
export function DatePickerSheet({
  visible,
  onClose,
  value,
  max,
  onChange,
  marked,
  title = "Pick a day",
}: {
  visible: boolean;
  onClose: () => void;
  value: string;
  max: string;
  onChange: (iso: string) => void;
  marked?: Set<string>;
  title?: string;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(`${value}T00:00:00`);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const cells = monthGrid(cursor.y, cursor.m);
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const maxMonth = max.slice(0, 7);
  const thisMonth = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
  const shift = (n: number) => setCursor(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  return (
    <SheetFrame visible={visible} onClose={onClose} title={title}>
      <View style={styles.monthRow}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={styles.monthBtn}>
          <ChevronLeft size={18} color={colors.text} />
        </Pressable>
        <Text style={styles.month}>{label}</Text>
        <Pressable onPress={() => shift(1)} hitSlop={10} disabled={thisMonth >= maxMonth} style={[styles.monthBtn, { transform: [{ rotate: "180deg" }] }, thisMonth >= maxMonth && { opacity: 0.25 }]}>
          <ChevronLeft size={18} color={colors.text} />
        </Pressable>
      </View>
      <View style={styles.grid}>
        {WEEKDAYS.map((w, i) => (
          <Text key={`w${i}`} style={styles.weekday}>{w}</Text>
        ))}
        {cells.map((iso, i) => {
          if (!iso) return <View key={`e${i}`} style={styles.cell} />;
          const disabled = iso > max;
          const on = iso === value;
          return (
            <Pressable
              key={iso}
              disabled={disabled}
              onPress={() => {
                onChange(iso);
                onClose();
              }}
              style={[styles.cell, on && styles.cellOn]}
            >
              <Text style={[styles.day, disabled && { color: colors.textFaint, opacity: 0.4 }, on && { color: colors.bg }, iso === max && !on && { color: colors.recovery }]}>
                {Number(iso.slice(8))}
              </Text>
              {marked?.has(iso) ? <View style={[styles.mark, on && { backgroundColor: colors.bg }]} /> : null}
            </Pressable>
          );
        })}
      </View>
      {value !== max ? (
        <Pressable
          style={styles.todayBtn}
          onPress={() => {
            onChange(max);
            onClose();
          }}
        >
          <Text style={styles.todayText}>Back to today</Text>
        </Pressable>
      ) : null}
    </SheetFrame>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: "#15161C",
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  grabber: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)", marginBottom: spacing.md },
  title: { ...font.overline, fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  item: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderRadius: radius.sm },
  itemIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  itemLabel: { ...font.heading, fontSize: 16, color: colors.text },
  itemSub: { ...font.caption, color: colors.textMuted, marginTop: 1 },
  check: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.recovery },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  monthBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center" },
  month: { ...font.heading, fontSize: 16, color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", ...font.overline, fontSize: 10, color: colors.textFaint, paddingVertical: 6 },
  cell: { width: `${100 / 7}%`, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 },
  cellOn: { backgroundColor: colors.text },
  day: { fontFamily: fonts.numeral, fontSize: 16, color: colors.text },
  mark: { position: "absolute", bottom: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.strain },
  todayBtn: { marginTop: spacing.sm, alignSelf: "center", paddingVertical: 10, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: "rgba(255,255,255,0.08)" },
  todayText: { ...font.label, color: colors.text },
});
