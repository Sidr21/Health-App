/**
 * Front/back body map. A stylised mannequin (capsule limbs, faceted muscle plates) rather than
 * an anatomical drawing: each muscle group is one plate we can tint by freshness, load or volume.
 *
 * Coordinates live in a 200 x 420 box. Paired muscles are drawn once for the figure's left side
 * (viewer's left on the front view) and mirrored across x = 100.
 */
import React from "react";
import { View } from "react-native";
import Svg, { Defs, Ellipse, G, Line, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import type { MuscleId } from "@/lib/api";
import type { MuscleFill } from "@/lib/strength";

export type Side = "front" | "back";

const MIRROR = "translate(200,0) scale(-1,1)";
const BASE = "#1C212B";
const PLATE = "#2A303C";
const SEAM = "#12151C";

type Shape = { d: string; mirror?: boolean };

/** Muscle plates per side. `mirror` draws the shape on both halves of the body. */
const PLATES: Record<Side, Partial<Record<MuscleId, Shape[]>>> = {
  front: {
    traps: [{ d: "M93 55 C89 61 82 65 74 67 L95 70 Z", mirror: true }],
    shoulders: [{ d: "M74 67 C62 66 52 74 50 88 C49 97 51 104 55 108 C58 96 64 86 75 80 Z", mirror: true }],
    chest: [{ d: "M98 73 L78 71 C72 76 69 86 69 97 C71 108 81 114 98 112 Z", mirror: true }],
    biceps: [{ d: "M67 97 C58 102 53 117 51 133 C50 142 54 147 59 144 C65 132 70 115 71 100 Z", mirror: true }],
    forearms: [{ d: "M56 153 C48 160 42 176 40 192 C40 199 44 202 48 198 C53 185 58 169 60 156 Z", mirror: true }],
    abs: [
      { d: "M90 118 h9 v19 h-9 Z", mirror: true },
      { d: "M90 140 h9 v19 h-9 Z", mirror: true },
      { d: "M90 162 h9 v20 C95 186 92 186 90 183 Z", mirror: true },
    ],
    obliques: [{ d: "M87 117 L73 113 C72 133 74 156 80 178 L87 188 Z", mirror: true }],
    quads: [{ d: "M95 212 L79 207 C74 225 72 252 74 278 C76 289 84 293 90 288 C93 268 95 240 95 212 Z", mirror: true }],
    adductors: [{ d: "M99 212 L97 213 C96 232 94 250 92 262 C96 252 100 232 100 213 Z", mirror: true }],
    calves: [{ d: "M78 306 C74 322 74 342 77 360 C80 364 84 362 86 358 C88 340 90 322 89 306 C86 302 81 302 78 306 Z", mirror: true }],
  },
  back: {
    traps: [{ d: "M100 54 C94 61 84 65 74 68 C85 75 93 88 100 120 C107 88 115 75 126 68 C116 65 106 61 100 54 Z" }],
    shoulders: [{ d: "M74 68 C62 66 52 74 50 88 C49 97 51 104 55 108 C58 96 64 86 75 81 Z", mirror: true }],
    lats: [{ d: "M97 124 C92 104 84 90 74 84 C69 98 70 120 76 141 C80 156 88 166 96 170 Z", mirror: true }],
    triceps: [{ d: "M67 97 C58 102 53 117 51 133 C50 142 54 147 59 144 C65 132 70 115 71 100 Z", mirror: true }],
    forearms: [{ d: "M56 153 C48 160 42 176 40 192 C40 199 44 202 48 198 C53 185 58 169 60 156 Z", mirror: true }],
    lower_back: [{ d: "M99 128 L92 134 C91 150 90 168 92 188 L99 190 Z", mirror: true }],
    glutes: [{ d: "M99 196 L84 196 C76 204 74 220 80 230 C86 238 96 236 99 228 Z", mirror: true }],
    hamstrings: [{ d: "M96 241 L80 237 C76 253 76 272 80 288 C84 293 90 293 92 288 C95 272 97 256 96 241 Z", mirror: true }],
    calves: [{ d: "M78 302 C72 316 72 334 78 347 C82 351 88 351 90 347 C93 333 93 316 88 302 C85 298 81 298 78 302 Z", mirror: true }],
  },
};

/** Square crops used for list thumbnails. */
export const FOCUS: Record<MuscleId, { side: Side; box: string }> = {
  chest: { side: "front", box: "52 48 96 96" },
  shoulders: { side: "front", box: "36 46 128 128" },
  biceps: { side: "front", box: "26 74 84 84" },
  triceps: { side: "back", box: "26 74 84 84" },
  forearms: { side: "front", box: "18 136 76 76" },
  abs: { side: "front", box: "58 104 84 84" },
  obliques: { side: "front", box: "54 100 92 92" },
  traps: { side: "back", box: "50 44 100 100" },
  lats: { side: "back", box: "50 70 100 100" },
  lower_back: { side: "back", box: "58 112 84 84" },
  glutes: { side: "back", box: "56 180 88 88" },
  quads: { side: "front", box: "52 196 96 96" },
  hamstrings: { side: "back", box: "52 222 96 96" },
  adductors: { side: "front", box: "60 198 80 80" },
  calves: { side: "back", box: "52 290 96 96" },
};

function Mannequin() {
  // Capsule limbs + torso + head, one flat tone with a soft top-down gradient.
  const limb = (x1: number, y1: number, x2: number, y2: number, w: number, k: string) => (
    <G key={k}>
      <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#bm-base)" strokeWidth={w} strokeLinecap="round" />
      <Line x1={200 - x1} y1={y1} x2={200 - x2} y2={y2} stroke="url(#bm-base)" strokeWidth={w} strokeLinecap="round" />
    </G>
  );
  return (
    <G>
      <Ellipse cx={100} cy={30} rx={17} ry={21} fill="url(#bm-base)" />
      <Rect x={91} y={46} width={18} height={16} rx={6} fill="url(#bm-base)" />
      <Path
        d="M72 64 C84 58 116 58 128 64 L134 96 C134 122 128 150 124 176 C122 190 120 198 118 202 L82 202 C80 198 78 190 76 176 C72 150 66 122 66 96 Z"
        fill="url(#bm-base)"
      />
      <Path d="M80 196 L120 196 C123 208 119 222 108 230 L92 230 C81 222 77 208 80 196 Z" fill="url(#bm-base)" />
      {limb(64, 82, 55, 148, 21, "upper")}
      {limb(54, 152, 43, 204, 15, "fore")}
      {limb(88, 210, 84, 292, 30, "thigh")}
      {limb(84, 300, 82, 376, 20, "shin")}
      <Ellipse cx={40} cy={216} rx={7} ry={10} fill={BASE} />
      <Ellipse cx={160} cy={216} rx={7} ry={10} fill={BASE} />
      <Ellipse cx={81} cy={390} rx={10} ry={7} fill={BASE} />
      <Ellipse cx={119} cy={390} rx={10} ry={7} fill={BASE} />
    </G>
  );
}

export function BodyMap({
  side,
  fills,
  width = 150,
  focus,
}: {
  side: Side;
  fills: Partial<Record<MuscleId, MuscleFill>>;
  width?: number;
  /** crop to one muscle and dim the rest (list thumbnails) */
  focus?: MuscleId;
}) {
  const box = focus ? FOCUS[focus].box : "0 0 200 420";
  const [, , bw, bh] = box.split(" ").map(Number);
  const height = (width * bh) / bw;
  const plates = PLATES[side];
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} viewBox={box}>
        <Defs>
          <LinearGradient id="bm-base" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#232936" />
            <Stop offset="1" stopColor={BASE} />
          </LinearGradient>
        </Defs>
        <Mannequin />
        {(Object.keys(plates) as MuscleId[]).map((id) => {
          const f = fills[id];
          const dim = focus != null && focus !== id;
          return (plates[id] ?? []).map((shape, i) => {
            const common = {
              d: shape.d,
              fill: f && !dim ? f.color : PLATE,
              fillOpacity: f && !dim ? f.opacity : dim ? 0.55 : 1,
              stroke: SEAM,
              strokeWidth: 1.1,
              strokeLinejoin: "round" as const,
            };
            return (
              <G key={`${id}-${i}`}>
                <Path {...common} />
                {shape.mirror ? <Path {...common} transform={MIRROR} /> : null}
              </G>
            );
          });
        })}
      </Svg>
    </View>
  );
}
