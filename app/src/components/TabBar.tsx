import React, { type ComponentType } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HeartIcon, HomeIcon, JournalIcon, PlusIcon, RunnerIcon, type IconProps } from "@/components/icons";
import { colors, font, radius } from "@/theme/tokens";

const ICONS: Record<string, ComponentType<IconProps>> = {
  index: HomeIcon,
  journal: JournalIcon,
  fitness: RunnerIcon,
  biology: HeartIcon,
};

/** Bevel's floating pill tab bar with a separate round "+" button. */
/** Subset of @react-navigation's BottomTabBarProps we use (keeps us off the transitive import). */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.outer} pointerEvents="box-none">
      <LinearGradient colors={["rgba(18,19,22,0)", "rgba(18,19,22,0.9)", colors.bg]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 14) }]} pointerEvents="box-none">
      <View style={styles.pill}>
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const Icon = ICONS[route.name] ?? HomeIcon;
          const label = descriptors[route.key]?.options.title ?? route.name;
          const color = focused ? colors.text : colors.textFaint;
          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.item, focused && styles.itemActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
            >
              <Icon size={22} color={color} />
              <Text style={[styles.label, { color }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable style={styles.fab} accessibilityLabel="Add">
        <PlusIcon size={26} color={colors.text} />
      </Pressable>
      </View>
    </View>
  );
}

export const TAB_BAR_HEIGHT = 96;

const styles = StyleSheet.create({
  outer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 28 },
  wrap: {
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pill: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: "#26272D",
    borderRadius: radius.pill,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: radius.pill, gap: 3 },
  itemActive: { backgroundColor: colors.cardRaised },
  label: { ...font.caption, fontSize: 11 },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#26272D",
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
});
