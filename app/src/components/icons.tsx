/** Small line icons drawn with SVG so they look the same on every platform. */
import React from "react";
import Svg, { Circle, Line, Path, Polyline, Rect } from "react-native-svg";

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const });
const stroke = (color: string, w: number) => ({ stroke: color, strokeWidth: w, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const HomeIcon = ({ size = 22, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M3 11.5 12 4l9 7.5" {...stroke(color, strokeWidth)} />
    <Path d="M5.5 10.5V20h13v-9.5" {...stroke(color, strokeWidth)} />
    <Path d="M10 20v-5h4v5" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const JournalIcon = ({ size = 22, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Rect x="5" y="3.5" width="14" height="17" rx="2.5" {...stroke(color, strokeWidth)} />
    <Line x1="8.5" y1="8.5" x2="15.5" y2="8.5" {...stroke(color, strokeWidth)} />
    <Line x1="8.5" y1="12" x2="15.5" y2="12" {...stroke(color, strokeWidth)} />
    <Line x1="8.5" y1="15.5" x2="13" y2="15.5" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const RunnerIcon = ({ size = 22, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="15.5" cy="4.5" r="1.8" {...stroke(color, strokeWidth)} />
    <Path d="M6 20l3.5-5.5 3-1.5-1-4.5-3.5 1.5L6 12.5" {...stroke(color, strokeWidth)} />
    <Path d="M11.5 8.5 14 12l4 1.5" {...stroke(color, strokeWidth)} />
    <Path d="M12.5 13l2.5 2.5-1 4.5" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const HeartIcon = ({ size = 22, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const PlusIcon = ({ size = 22, color = "#fff", strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size)}>
    <Line x1="12" y1="5" x2="12" y2="19" {...stroke(color, strokeWidth)} />
    <Line x1="5" y1="12" x2="19" y2="12" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const ChevronDown = ({ size = 16, color = "#fff", strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size)}>
    <Polyline points="6 9 12 15 18 9" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const ChevronRight = ({ size = 16, color = "#fff", strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size)}>
    <Polyline points="9 6 15 12 9 18" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const ArrowRight = ({ size = 16, color = "#fff", strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size)}>
    <Line x1="5" y1="12" x2="19" y2="12" {...stroke(color, strokeWidth)} />
    <Polyline points="13 6 19 12 13 18" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const CheckCircle = ({ size = 14, color = "#fff", strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="9" fill={color} />
    <Polyline points="8 12.5 11 15.5 16 9.5" stroke="#121316" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

export const ArrowDownCircle = ({ size = 14, color = "#fff", strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="9" fill={color} />
    <Line x1="12" y1="7.5" x2="12" y2="16" stroke="#121316" strokeWidth={strokeWidth} strokeLinecap="round" />
    <Polyline points="8.5 12.5 12 16 15.5 12.5" stroke="#121316" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

export const ArrowUpCircle = ({ size = 14, color = "#fff", strokeWidth = 2 }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="9" fill={color} />
    <Line x1="12" y1="16.5" x2="12" y2="8" stroke="#121316" strokeWidth={strokeWidth} strokeLinecap="round" />
    <Polyline points="8.5 11.5 12 8 15.5 11.5" stroke="#121316" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

export const PulseIcon = ({ size = 16, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Polyline points="3 12 7 12 9.5 6 12.5 18 15 10 17 12 21 12" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const MoonIcon = ({ size = 16, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const SunIcon = ({ size = 16, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="12" cy="12" r="4" {...stroke(color, strokeWidth)} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const r = (a * Math.PI) / 180;
      return <Line key={a} x1={12 + 6.5 * Math.cos(r)} y1={12 + 6.5 * Math.sin(r)} x2={12 + 9 * Math.cos(r)} y2={12 + 9 * Math.sin(r)} {...stroke(color, strokeWidth)} />;
    })}
  </Svg>
);

export const CloudIcon = ({ size = 16, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.5A3.3 3.3 0 0 0 7 18z" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const CalendarIcon = ({ size = 20, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Rect x="4" y="5" width="16" height="15" rx="2.5" {...stroke(color, strokeWidth)} />
    <Line x1="4" y1="10" x2="20" y2="10" {...stroke(color, strokeWidth)} />
    <Line x1="8.5" y1="3" x2="8.5" y2="7" {...stroke(color, strokeWidth)} />
    <Line x1="15.5" y1="3" x2="15.5" y2="7" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const DotsIcon = ({ size = 20, color = "#fff" }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="6" cy="12" r="1.6" fill={color} />
    <Circle cx="12" cy="12" r="1.6" fill={color} />
    <Circle cx="18" cy="12" r="1.6" fill={color} />
  </Svg>
);

export const SparkleIcon = ({ size = 16, color = "#fff", strokeWidth = 1.6 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" {...stroke(color, strokeWidth)} />
    <Path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" fill={color} />
  </Svg>
);

export const BikeIcon = ({ size = 18, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="6" cy="16" r="3.5" {...stroke(color, strokeWidth)} />
    <Circle cx="18" cy="16" r="3.5" {...stroke(color, strokeWidth)} />
    <Path d="M6 16l4-7h5l3 7M10 9l3 7h-7" {...stroke(color, strokeWidth)} />
    <Path d="M14 5h2.5" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const ZzzIcon = ({ size = 18, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M5 9h5l-5 6h5" {...stroke(color, strokeWidth)} />
    <Path d="M13 5h5l-5 6h5" {...stroke(color, strokeWidth)} />
    <Path d="M14 15h4l-4 4h4" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const MountainIcon = ({ size = 18, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M3 19l6-10 3.5 5.5L15 11l6 8z" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const DumbbellIcon = ({ size = 18, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Rect x="3" y="9" width="3" height="6" rx="1" {...stroke(color, strokeWidth)} />
    <Rect x="18" y="9" width="3" height="6" rx="1" {...stroke(color, strokeWidth)} />
    <Line x1="6" y1="12" x2="18" y2="12" {...stroke(color, strokeWidth)} />
    <Rect x="7" y="7.5" width="3" height="9" rx="1" {...stroke(color, strokeWidth)} />
    <Rect x="14" y="7.5" width="3" height="9" rx="1" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const WalkIcon = ({ size = 18, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Circle cx="13" cy="4.5" r="1.8" {...stroke(color, strokeWidth)} />
    <Path d="M9 20l2.5-6 2-1V9l-3 1.5L9 13" {...stroke(color, strokeWidth)} />
    <Path d="M13.5 13l2 3 .5 4" {...stroke(color, strokeWidth)} />
    <Path d="M12.5 8.5 15 11l3 .5" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const LeafIcon = ({ size = 16, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M5 19c0-8 5-13 14-13-1 9-6 13-14 13z" {...stroke(color, strokeWidth)} />
    <Path d="M5 19c3-4 6-7 10-9" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const FlameIcon = ({ size = 14, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Path d="M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-1.5.5-2.5 1-3.5.5 1.5 1.5 2 2 2 0-3-1-5 1-7.5z" {...stroke(color, strokeWidth)} />
  </Svg>
);

export const RouteIcon = ({ size = 14, color = "#fff", strokeWidth = 1.8 }: IconProps) => (
  <Svg {...base(size)}>
    <Line x1="4" y1="7" x2="4" y2="17" {...stroke(color, strokeWidth)} />
    <Line x1="9" y1="5" x2="9" y2="19" {...stroke(color, strokeWidth)} />
    <Line x1="14" y1="8" x2="14" y2="16" {...stroke(color, strokeWidth)} />
    <Line x1="19" y1="10" x2="19" y2="14" {...stroke(color, strokeWidth)} />
  </Svg>
);
