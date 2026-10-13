import React, { type PropsWithChildren } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Backdrop, type Glow } from "@/components/Backdrop";
import { TAB_BAR_HEIGHT } from "@/components/TabBar";
import { colors, spacing } from "@/theme/tokens";

interface Props {
  refreshing?: boolean;
  onRefresh?: () => void;
  glow?: Glow;
  bg?: string;
}

export function Screen({ refreshing, onRefresh, glow = "home", bg = colors.bg, children }: PropsWithChildren<Props>) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { backgroundColor: bg }]}>
      <Backdrop glow={glow} bg={bg} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} /> : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  screen: { flex: 1, paddingHorizontal: spacing.lg },
});
