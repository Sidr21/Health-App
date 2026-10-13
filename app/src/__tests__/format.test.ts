import { hms, km, pct } from "@/lib/format";

test("hms", () => {
  expect(hms(37 * 60 + 18)).toBe("37m");
  expect(hms(8 * 3600 + 5 * 60)).toBe("8h 05m");
  expect(hms(null)).toBe("–");
});

test("km / pct", () => {
  expect(km(6040)).toBe("3.75 mi");
  expect(km(6040, "metric")).toBe("6.04 km");
  expect(pct(71.6)).toBe("72%");
});
