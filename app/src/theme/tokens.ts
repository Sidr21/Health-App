/** Dark design tokens matching Bevel's in-app screens (docs/reference/bevel/09–16). */
export const colors = {
  bg: "#0E0F13",
  card: "#1A1B22",
  cardRaised: "#262830",
  pill: "#1F2027",
  border: "#2A2B33",
  hairline: "#30313A",
  // sleep screens use a navy palette
  sleepBg: "#0F1226",
  sleepCard: "#1A1F3E",
  sleepCardRaised: "#242A52",
  text: "#F4F4F6",
  textMuted: "#9C9DA6",
  textFaint: "#62636C",
  // category accents
  recovery: "#4CD964",
  recoveryAmber: "#F5B400",
  recoveryRed: "#FF453A",
  sleep: "#7B8CFF",
  sleepDeep: "#9B6BFF",
  sleepRem: "#6FC8FF",
  sleepAwake: "#FF9F43",
  strain: "#FF7A3D",
  stress: "#F5C542",
  energy: "#36D1C4",
  cardio: "#4C8DFF",
  muscular: "#38C6FF",
  ring: "#2C2D33",
  run: "#3DD6A4",
  bike: "#8B7CFF",
  hike: "#7FD35E",
  gold: "#D4A72C",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 12, md: 18, lg: 26, pill: 999 } as const;

export const font = {
  display: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -0.6 },
  title: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.4 },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  label: { fontSize: 13, fontWeight: "500" as const },
  caption: { fontSize: 12, fontWeight: "500" as const },
  number: { fontSize: 30, fontWeight: "700" as const, fontVariant: ["tabular-nums"] as ("tabular-nums")[] },
} as const;

export function bandColor(band: "green" | "amber" | "red" | null | undefined): string {
  if (band === "green") return colors.recovery;
  if (band === "amber") return colors.recoveryAmber;
  if (band === "red") return colors.recoveryRed;
  return colors.textFaint;
}
