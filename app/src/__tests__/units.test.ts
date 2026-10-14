import { clockDuration, distance, elevation, height, pace, parseClock, setUnits } from "@/lib/units";

afterEach(() => setUnits("imperial"));

test("pace per mile and per km", () => {
  expect(pace(370)).toBe("9:55 /mi");
  expect(pace(370, "metric")).toBe("6:10 /km");
  expect(pace(null)).toBe("–");
});

test("distance, elevation and height follow the unit setting", () => {
  expect(distance(6040)).toBe("3.75 mi");
  setUnits("metric");
  expect(distance(6040)).toBe("6.04 km");
  expect(elevation(15)).toBe("15 m");
  expect(height(175)).toBe("175 cm");
  expect(height(175, "imperial")).toBe("5′9″");
  expect(elevation(15, "imperial")).toBe("49 ft");
});

test("clock durations", () => {
  expect(clockDuration(2238)).toBe("37:18");
  expect(clockDuration(13333)).toBe("3:42:13");
  expect(clockDuration(null)).toBe("–");
});

describe("parseClock", () => {
  it("reads mm:ss and h:mm:ss", () => {
    expect(parseClock("20:00")).toBe(1200);
    expect(parseClock("1:39:51")).toBe(5991);
    expect(parseClock(" 45:03 ")).toBe(2703);
  });
  it("rejects malformed times", () => {
    expect(parseClock("20")).toBeNull();
    expect(parseClock("20:75")).toBeNull();
    expect(parseClock("1:2:3:4")).toBeNull();
    expect(parseClock("ab:cd")).toBeNull();
  });
});
