import type { MuscleStateOut } from "@/lib/api";
import { fillsFor, relativeDay, toUnit, weight } from "@/lib/strength";

jest.mock("@/lib/api", () => ({ api: {} }));
jest.mock("@/lib/useDays", () => ({ todayIso: () => "2026-10-13" }));

const m = (id: MuscleStateOut["id"], freshness: number, status: MuscleStateOut["status"], load = 0, vol = 0): MuscleStateOut => ({
  id, name: id, views: ["front"], freshness, status, fatigue: 0, load_7d: load, sets_7d: 0, volume_7d_kg: vol, last_trained: null, sources: {},
});

test("weights convert to pounds", () => {
  expect(toUnit(100)).toBeCloseTo(220.46, 1);
  expect(weight(83.91)).toBe("185 lb");
  expect(weight(20, "kg")).toBe("20 kg");
  expect(weight(null)).toBe("–");
});

test("freshness fills: fresh muscles untinted, fatigue stronger than recovered", () => {
  const f = fillsFor([m("chest", 100, "recovered"), m("quads", 90, "recovered"), m("lats", 60, "fatigued"), m("glutes", 30, "depleted")], "freshness");
  expect(f.chest).toBeUndefined();
  expect(f.quads!.opacity).toBeLessThan(f.lats!.opacity);
  expect(f.lats!.opacity).toBeLessThan(f.glutes!.opacity);
});

test("load fills scale to the most-loaded muscle", () => {
  const f = fillsFor([m("quads", 80, "fatigued", 10), m("calves", 95, "recovered", 5), m("chest", 100, "recovered", 0)], "load");
  expect(f.quads!.opacity).toBe(1);
  expect(f.calves!.opacity).toBeCloseTo(0.625);
  expect(f.chest).toBeUndefined();
});

test("relative day uses calendar days", () => {
  const lastNight = new Date();
  lastNight.setDate(lastNight.getDate() - 1);
  lastNight.setHours(23, 30, 0, 0);
  expect(relativeDay(lastNight.toISOString())).toBe("yesterday");
  expect(relativeDay(new Date().toISOString())).toBe("today");
  expect(relativeDay(null)).toBe("not trained recently");
});
