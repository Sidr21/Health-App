import { clockMinutes } from "@/lib/scores";

describe("clockMinutes", () => {
  it("keeps increasing past midnight", () => {
    expect(clockMinutes(["22:00", "23:30", "00:15"])).toEqual([1320, 1410, 1455]);
  });
});
