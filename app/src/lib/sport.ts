import type { ComponentType } from "react";

import { BikeIcon, DumbbellIcon, MountainIcon, RunnerIcon, WalkIcon, type IconProps } from "@/components/icons";
import { colors } from "@/theme/tokens";

export interface SportMeta {
  name: string;
  Icon: ComponentType<IconProps>;
  color: string;
}

/** COROS sport codes (see querySportRecords) -> display metadata. */
export function sportMeta(code: number | null | undefined, fallbackName = "Workout"): SportMeta {
  if (code == null) return { name: fallbackName, Icon: RunnerIcon, color: colors.run };
  if (code >= 100 && code < 104) return { name: code === 101 ? "Indoor Run" : "Outdoor Run", Icon: RunnerIcon, color: colors.run };
  if (code === 104 || code === 105) return { name: "Hike", Icon: MountainIcon, color: colors.hike };
  if (code >= 200 && code < 300) return { name: code === 201 ? "Indoor Cycling" : "Cycling", Icon: BikeIcon, color: colors.bike };
  if (code === 402 || code === 9901) return { name: "Strength", Icon: DumbbellIcon, color: colors.strain };
  if (code === 900) return { name: "Walk", Icon: WalkIcon, color: colors.energy };
  return { name: fallbackName, Icon: RunnerIcon, color: colors.run };
}
