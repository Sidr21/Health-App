/** Dark-first design tokens matching the Bevel reference screens (docs/reference/bevel). */
export const colors = {
  bg: "#0B0B0E",
  card: "#1C1D22",
  cardRaised: "#26272E",
  border: "#2E2F37",
  text: "#F5F5F7",
  textMuted: "#9A9BA3",
  textFaint: "#5F6068",
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
  ring: "#2E2F37",
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const font = {
  display: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: "700" as const },
  heading: { fontSize: 17, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  label: { fontSize: 13, fontWeight: "500" as const },
  number: { fontSize: 28, fontWeight: "700" as const, fontVariant: ["tabular-nums"] as ("tabular-nums")[] },
} as const;

export function bandColor(band: "green" | "amber" | "red" | null | undefined): string {
  if (band === "green") return colors.recovery;
  if (band === "amber") return colors.recoveryAmber;
  if (band === "red") return colors.recoveryRed;
  return colors.textFaint;
}
