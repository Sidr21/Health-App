import React, { type PropsWithChildren } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TAB_BAR_HEIGHT } from "@/components/TabBar";
import { colors, spacing } from "@/theme/tokens";

interface Props {
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function Screen({ refreshing, onRefresh, children }: PropsWithChildren<Props>) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg },
});
