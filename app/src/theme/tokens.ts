/**
 * Design tokens. Our own identity: Bevel's information layout, but a cooler blue-black palette,
 * Whoop-style open dials, uppercase micro-labels and abstract aurora heroes instead of illustrations.
 */
export const colors = {
  bg: "#0A0C11",
  card: "#13161D",
  cardRaised: "#1C2029",
  pill: "#161A22",
  border: "#222733",
  hairline: "#2A3040",
  text: "#F3F5F9",
  textMuted: "#8E96A6",
  textFaint: "#565D6B",
  // sleep screens use a deep indigo palette
  sleepBg: "#0B0D1F",
  sleepCard: "#161A3A",
  sleepCardRaised: "#1F2550",
  // category accents
  recovery: "#2EE6A6",
  recoveryAmber: "#F7C948",
  recoveryRed: "#FF5C5C",
  sleep: "#A78BFA",
  sleepDeep: "#7C5CFF",
  sleepRem: "#67D4FF",
  sleepAwake: "#FFA657",
  strain: "#3D8BFF",
  stress: "#F7B955",
  energy: "#56E0FF",
  cardio: "#3D8BFF",
  muscular: "#56E0FF",
  ring: "#1B1F28",
  run: "#2EE6A6",
  bike: "#A78BFA",
  hike: "#8BE07A",
  gold: "#E0B64A",
} as const;

/** Condensed face for numerals and uppercase labels; body text stays on the system font. */
export const fonts = {
  numeral: "BarlowSemiCondensed_600SemiBold",
  numeralBold: "BarlowSemiCondensed_700Bold",
  label: "BarlowSemiCondensed_600SemiBold",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 18, lg: 24, pill: 999 } as const;

export const font = {
  display: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -0.6 },
  title: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  label: { fontSize: 13, fontWeight: "500" as const },
  caption: { fontSize: 12, fontWeight: "500" as const },
  /** uppercase micro-label, Whoop-style */
  overline: { fontSize: 12, fontFamily: "BarlowSemiCondensed_600SemiBold", letterSpacing: 1.4, textTransform: "uppercase" as const },
  number: { fontSize: 32, fontFamily: "BarlowSemiCondensed_600SemiBold", fontVariant: ["tabular-nums"] as ("tabular-nums")[], letterSpacing: -0.2 },
} as const;

export function bandColor(band: "green" | "amber" | "red" | null | undefined): string {
  if (band === "green") return colors.recovery;
  if (band === "amber") return colors.recoveryAmber;
  if (band === "red") return colors.recoveryRed;
  return colors.textFaint;
}
