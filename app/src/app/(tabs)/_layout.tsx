import { Tabs } from "expo-router";
import React from "react";

import { TabBar } from "@/components/TabBar";
import { colors } from "@/theme/tokens";

/** Bevel's tab bar: Home · Journal · Fitness · Biology, floating, with a separate + button. */
export default function TabsLayout() {
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="journal" options={{ title: "Journal" }} />
      <Tabs.Screen name="fitness" options={{ title: "Fitness" }} />
      <Tabs.Screen name="biology" options={{ title: "Biology" }} />
    </Tabs>
  );
}
