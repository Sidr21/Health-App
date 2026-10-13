/** Per-screen ambient glow behind the content (warm for Fitness, navy for Sleep, neutral for Home). */
import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { colors } from "@/theme/tokens";

export type Glow = "none" | "home" | "fitness" | "sleep" | "green" | "amber" | "red";

const GLOWS: Record<Exclude<Glow, "none">, string> = {
  home: "#2A2B36",
  fitness: "#7A3E12",
  sleep: "#4B4FB8",
  green: "#2E8B57",
  amber: "#B8860B",
  red: "#B03A2E",
};

export function Backdrop({ glow = "home", height = 520, bg = colors.bg }: { glow?: Glow; height?: number; bg?: string }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: bg }]}>
      {glow !== "none" ? (
        <Svg width="100%" height={height} viewBox="0 0 390 520" preserveAspectRatio="none">
          <Defs>
            <RadialGradient id="glow" cx="50%" cy="0%" r="75%">
              <Stop offset="0" stopColor={GLOWS[glow]} stopOpacity={0.55} />
              <Stop offset="0.55" stopColor={GLOWS[glow]} stopOpacity={0.12} />
              <Stop offset="1" stopColor={bg} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x={0} y={0} width={390} height={520} fill="url(#glow)" />
          <Circle cx={195} cy={-40} r={160} fill="url(#glow)" opacity={0.35} />
        </Svg>
      ) : null}
    </View>
  );
}
