/**
 * Bevel's card surface: a soft top-left → bottom-right gradient, a hairline highlight border and,
 * on iOS, a shadow. Every card, tile and panel in the app renders through this.
 */
import { LinearGradient } from "expo-linear-gradient";
import React, { type PropsWithChildren } from "react";
import { Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";

import { colors, radius } from "@/theme/tokens";

export type SurfaceTone = "card" | "raised" | "sleep" | "sleepRaised" | "glass";

const TONES: Record<SurfaceTone, { from: string; to: string; border: string }> = {
  card: { from: "#24252D", to: "#17181E", border: "rgba(255,255,255,0.055)" },
  raised: { from: "#2F3039", to: "#22232A", border: "rgba(255,255,255,0.07)" },
  sleep: { from: "#262C5C", to: "#161A3B", border: "rgba(140,150,255,0.14)" },
  sleepRaised: { from: "#30377A", to: "#1E2350", border: "rgba(140,150,255,0.18)" },
  glass: { from: "rgba(255,255,255,0.08)", to: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.10)" },
};

interface Props {
  tone?: SurfaceTone;
  style?: StyleProp<ViewStyle>;
  radiusSize?: number;
  onPress?: () => void;
  padded?: boolean;
}

export function Surface({ tone = "card", style, radiusSize = radius.md, onPress, padded = true, children }: PropsWithChildren<Props>) {
  const t = TONES[tone];
  const body = (
    <LinearGradient
      colors={[t.from, t.to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.base, { borderRadius: radiusSize, borderColor: t.border }, padded && styles.padded, style]}
    >
      {children}
    </LinearGradient>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.88, transform: [{ scale: 0.995 }] } : undefined)}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      default: {},
    }),
  },
  padded: { padding: 16 },
});

export const surfaceColors = { ...colors };
