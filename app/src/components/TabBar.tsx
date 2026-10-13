import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { type ComponentType } from "react";
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

/** Subset of @react-navigation's BottomTabBarProps we use (keeps us off the transitive import). */
interface TabBarProps {
  state: { index: number; routes: { key: string; name: string }[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: {
    emit: (e: { type: "tabPress"; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
    navigate: (name: string) => void;
  };
}

const PILL = ["#222733", "#161A22"] as const;

/** Bevel's floating pill tab bar: gradient glass pill with a highlight border and a separate round "+". */
export function TabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.outer} pointerEvents="box-none">
      <LinearGradient colors={["rgba(10,12,17,0)", "rgba(10,12,17,0.92)", colors.bg]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 14) }]} pointerEvents="box-none">
        <LinearGradient colors={[...PILL]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.pill}>
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
                style={styles.item}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
              >
                {focused ? <LinearGradient colors={["#2F3645", "#232834"]} style={[StyleSheet.absoluteFill, { borderRadius: radius.pill }]} /> : null}
                <Icon size={22} color={color} />
                <Text style={[styles.label, { color }]}>{label}</Text>
              </Pressable>
            );
          })}
        </LinearGradient>
        <LinearGradient colors={[...PILL]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.fab}>
          <Pressable style={styles.fabInner} accessibilityLabel="Log a lift" onPress={() => router.push("/strength/log")}>
            <PlusIcon size={26} color={colors.text} />
          </Pressable>
        </LinearGradient>
      </View>
    </View>
  );
}

export const TAB_BAR_HEIGHT = 96;

const styles = StyleSheet.create({
  outer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: 28 },
  wrap: { paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 10 },
  pill: {
    flex: 1,
    flexDirection: "row",
    borderRadius: radius.pill,
    padding: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
  },
  item: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8, borderRadius: radius.pill, gap: 3, overflow: "hidden" },
  label: { ...font.caption, fontSize: 11 },
  fab: { width: 64, height: 64, borderRadius: 32, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.10)" },
  fabInner: { flex: 1, alignItems: "center", justifyContent: "center" },
});
