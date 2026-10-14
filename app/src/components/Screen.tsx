import React, { type PropsWithChildren } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Backdrop, type Glow } from "@/components/Backdrop";
import { TAB_BAR_HEIGHT } from "@/components/TabBar";
import { colors, font, spacing } from "@/theme/tokens";

interface Props {
  refreshing?: boolean;
  onRefresh?: () => void;
  /** what the last pull-to-refresh couldn't do, e.g. "COROS isn't connected" */
  notices?: string[];
  glow?: Glow;
  bg?: string;
}

export function Screen({ refreshing, onRefresh, notices, glow = "home", bg = colors.bg, children }: PropsWithChildren<Props>) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <Backdrop glow={glow} bg={bg} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
      >
        {notices?.length ? (
          <View style={styles.notice}>
            {notices.map((n) => (
              <Text key={n} style={styles.noticeText}>{n}</Text>
            ))}
          </View>
        ) : null}
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
  notice: { borderRadius: 12, padding: 10, marginBottom: spacing.sm, backgroundColor: "rgba(247,201,72,0.10)", gap: 2 },
  noticeText: { ...font.caption, color: colors.recoveryAmber },
});
