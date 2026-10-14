import { isoDate } from "@/lib/api";
import { addDays } from "@/lib/dates";

test("isoDate uses the local calendar day, not UTC", () => {
  const lateEvening = new Date(2026, 9, 13, 23, 30); // local time
  expect(isoDate(lateEvening)).toBe("2026-10-13");
  expect(isoDate(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
});

test("addDays crosses months and years", () => {
  expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
});
