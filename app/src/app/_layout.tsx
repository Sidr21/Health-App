import {
  BarlowSemiCondensed_600SemiBold,
  BarlowSemiCondensed_700Bold,
  useFonts,
} from "@expo-google-fonts/barlow-semi-condensed";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { watchHealthKit } from "@/lib/healthkit";
import { queryClient } from "@/lib/query";
import { colors } from "@/theme/tokens";

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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="sleep/index" />
            <Stack.Screen name="sleep/night" options={{ presentation: "modal" }} />
            <Stack.Screen name="recovery" />
            <Stack.Screen name="settings" options={{ presentation: "modal" }} />
            <Stack.Screen name="muscles" options={{ presentation: "modal" }} />
            <Stack.Screen name="strength/log" options={{ presentation: "modal" }} />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
