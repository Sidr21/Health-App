import { Tabs } from "expo-router";
import React from "react";
import { Text, type ColorValue } from "react-native";

import { colors } from "@/theme/tokens";

function TabIcon({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;
}

const icon = (glyph: string) => {
  const Icon = ({ color }: { color: ColorValue }) => <TabIcon glyph={glyph} color={color} />;
  Icon.displayName = `TabIcon(${glyph})`;
  return Icon;
};

/** Bevel's tab bar: Home · Journal · Fitness · Biology. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textFaint,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("⌂") }} />
      <Tabs.Screen name="journal" options={{ title: "Journal", tabBarIcon: icon("▤") }} />
      <Tabs.Screen name="fitness" options={{ title: "Fitness", tabBarIcon: icon("➚") }} />
      <Tabs.Screen name="biology" options={{ title: "Biology", tabBarIcon: icon("♥") }} />
    </Tabs>
  );
}
