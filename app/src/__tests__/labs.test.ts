import { chartDomain, delta, flagLabel, labDate, fmtNum, groupBy, isOut, rangeLayout, rangeText, shown } from "@/lib/labs";

const row = { value: 3.4, value_text: null, unit: "mmol/L", value_std: 131.478, unit_std: "mg/dL", ref_low: null, ref_high: 3, ref_low_std: null, ref_high_std: 116.01 };

describe("labs display", () => {
  it("formats to three significant figures", () => {
    expect(fmtNum(131.478)).toBe("131");
    expect(fmtNum(5.432)).toBe("5.43");
    expect(fmtNum(42.0)).toBe("42");
    expect(fmtNum(0.0123)).toBe("0.012");
  });

  it("prefers the standardized value and falls back to the printed text", () => {
    expect(shown(row)).toMatchObject({ value: "131", unit: "mg/dL", hi: 116.01 });
    expect(shown({ ...row, value_std: null, unit_std: null })).toMatchObject({ value: "3.4", unit: "mmol/L", hi: 3 });
    expect(shown({ ...row, value: null, value_std: null, value_text: "Negative" })).toMatchObject({ value: "Negative", unit: "", num: null });
  });

  it("writes ranges", () => {
    expect(rangeText(70, 100)).toBe("70–100");
    expect(rangeText(null, 200)).toBe("< 200");
    expect(rangeText(40, null)).toBe("> 40");
    expect(rangeText(null, null)).toBeNull();
  });

  it("places the value against the range", () => {
    const inside = rangeLayout(85, 70, 100)!;
    expect(inside.dot!).toBeGreaterThan(inside.band[0]);
    expect(inside.dot!).toBeLessThan(inside.band[1]);
    const high = rangeLayout(131, null, 116)!;
    expect(high.band[0]).toBe(0);
    expect(high.dot!).toBeGreaterThan(high.band[1]);
    expect(rangeLayout(5000, 70, 100)!.dot).toBe(0.98);
    expect(rangeLayout(5, null, null)).toBeNull();
  });

  it("keeps the normal band inside the chart", () => {
    const [lo, hi] = chartDomain([131, 151], null, 116)!;
    expect(lo).toBeLessThan(116);
    expect(hi).toBeGreaterThan(151);
    expect(chartDomain([], 1, 2)).toBeUndefined();
  });

  it("adds the year to older dates", () => {
    const now = new Date("2026-10-14T12:00:00");
    expect(labDate("2026-03-02", now)).not.toMatch(/2026/);
    expect(labDate("2025-09-10", now)).toMatch(/2025/);
    expect(labDate(null, now)).toBe("undated");
  });

  it("flags, groups and diffs", () => {
    expect(isOut("normal")).toBe(false);
    expect(isOut("high")).toBe(true);
    expect(isOut(null)).toBe(false);
    expect(flagLabel("critical_low")).toBe("Critical low");
    expect(groupBy([{ c: "a" }, { c: "b" }, { c: "a" }], (x) => x.c).map(([k, v]) => [k, v.length])).toEqual([["a", 2], ["b", 1]]);
    expect(delta(131, 151)).toBe("−20");
    expect(delta(131.478, 139.2)).toBe("−8");
    expect(delta(5.4, 5.25)).toBe("+0.15");
    expect(delta(5, 5)).toBe("no change");
    expect(delta(5, null)).toBeNull();
  });
});
