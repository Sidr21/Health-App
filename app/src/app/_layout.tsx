import {
  BarlowSemiCondensed_600SemiBold,
  BarlowSemiCondensed_700Bold,
  useFonts,
} from "@expo-google-fonts/barlow-semi-condensed";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { api } from "@/lib/api";
import { watchHealthKit } from "@/lib/healthkit";
import { setUnits } from "@/lib/units";
import { queryClient } from "@/lib/query";
import { colors } from "@/theme/tokens";

/** Applies the backend's unit preference (imperial / metric) app-wide. */
function UnitsSync() {
  const q = useQuery({ queryKey: ["settings"], queryFn: api.settings, staleTime: 5 * 60_000 });
  useEffect(() => {
    if (q.data) setUnits(q.data.units);
  }, [q.data]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ BarlowSemiCondensed_600SemiBold, BarlowSemiCondensed_700Bold });
  useEffect(() => {
    let stop: (() => void) | undefined;
    watchHealthKit().then((s) => (stop = s)).catch(() => {});
    return () => stop?.();
  }, []);
  if (!fontsLoaded) return <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="light" />
          <UnitsSync />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="sleep/index" />
            <Stack.Screen name="sleep/night" options={{ presentation: "modal" }} />
            <Stack.Screen name="recovery" />
            <Stack.Screen name="settings" options={{ presentation: "modal" }} />
            <Stack.Screen name="muscles" options={{ presentation: "modal" }} />
            <Stack.Screen name="strength/log" options={{ presentation: "modal" }} />
            <Stack.Screen name="workout/[id]" options={{ presentation: "modal" }} />
            <Stack.Screen name="journal/insights" />
            <Stack.Screen name="body/[metric]" />
            <Stack.Screen name="fitness-models" />
            <Stack.Screen name="zones" />
            <Stack.Screen name="strain" />
            <Stack.Screen name="energy" />
            <Stack.Screen name="stress" />
            <Stack.Screen name="cardio-load" />
            <Stack.Screen name="bioage" />
            <Stack.Screen name="races" />
            <Stack.Screen name="vital/[metric]" />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
