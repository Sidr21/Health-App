/** Journal tag definitions shared by the Journal tab and the Insights screen. */
export interface TagDef {
  key: string;
  emoji: string;
  label: string;
  kind: "tri" | "number";
  unit?: string;
  placeholder?: string;
  group: "day" | "night";
}

export const TAGS: TagDef[] = [
  { key: "sugar", emoji: "🍬", label: "Added sugar", kind: "tri", group: "day" },
  { key: "caffeine", emoji: "☕", label: "Caffeine", kind: "number", unit: "mg", group: "day" },
  { key: "mood", emoji: "😊", label: "Daily mood", kind: "number", placeholder: "1–5", group: "day" },
  { key: "hydration", emoji: "💧", label: "Hydration", kind: "number", unit: "fl oz", group: "day" },
  { key: "alcohol", emoji: "🍷", label: "Alcohol", kind: "tri", group: "night" },
  { key: "late_meal", emoji: "🍽️", label: "Late meal", kind: "tri", group: "night" },
  { key: "screens", emoji: "📱", label: "Screens in bed", kind: "tri", group: "night" },
];

export const TAG_BY_KEY: Record<string, TagDef> = Object.fromEntries(TAGS.map((t) => [t.key, t]));

export function tagLabel(key: string): string {
  return TAG_BY_KEY[key]?.label ?? key.replace(/_/g, " ");
}
