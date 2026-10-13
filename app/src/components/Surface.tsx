/**
 * Card surface: a soft top-left → bottom-right gradient, a hairline highlight border and, on iOS,
 * a shadow. Layout styles (width, flex, margins, padding) always apply to the outer container, so a
 * tappable surface lays out exactly like a static one.
 */
import { LinearGradient } from "expo-linear-gradient";
import React, { type PropsWithChildren } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius } from "@/theme/tokens";

export type SurfaceTone = "card" | "raised" | "sleep" | "sleepRaised" | "glass";

const TONES: Record<SurfaceTone, { from: string; to: string; border: string }> = {
  card: { from: "#1A1E27", to: "#111419", border: "rgba(255,255,255,0.06)" },
  raised: { from: "#242934", to: "#191D25", border: "rgba(255,255,255,0.08)" },
  sleep: { from: "#1F2554", to: "#121634", border: "rgba(167,139,250,0.16)" },
  sleepRaised: { from: "#2A3170", to: "#1A1F48", border: "rgba(167,139,250,0.2)" },
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
  const container: StyleProp<ViewStyle> = [styles.base, { borderRadius: radiusSize, borderColor: t.border }, padded && styles.padded, style];
  const fill = (
    <LinearGradient
      pointerEvents="none"
      colors={[t.from, t.to]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, styles.fill, { borderRadius: radiusSize }]}
    />
  );
  if (!onPress) {
    return (
      <View style={container}>
        {fill}
        {children}
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [container, pressed && styles.pressed]}>
      {fill}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    // own stacking context so the gradient (zIndex -1) sits above our background but below content;
    // without it, web paints the absolutely positioned gradient over in-flow SVG children
    zIndex: 0,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 } },
      default: {},
    }),
  },
  fill: { zIndex: -1 },
  padded: { padding: 16 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.995 }] },
});
