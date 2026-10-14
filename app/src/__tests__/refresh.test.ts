import type { SyncStateOut } from "@/lib/api";
import { MAX_WAIT_MS, refreshAll, type RefreshDeps } from "@/lib/refresh";

const state = (over: Partial<SyncStateOut> = {}): SyncStateOut => ({
  enabled: false, interval_min: 0, running: false, last_started: null, last_finished: null,
  last_ok: true, last_error: null, last_days: 3, next_run: null, coros_auth: true, ...over,
});

function deps(over: Partial<RefreshDeps> = {}, states: SyncStateOut[] = [state()]): RefreshDeps & { calls: string[] } {
  const calls: string[] = [];
  let t = 0;
  const queue = [...states];
  return {
    calls,
    healthKitAvailable: async () => true,
    syncHealthKit: async () => void calls.push("healthkit"),
    syncNow: async () => (calls.push("syncNow"), queue.shift() ?? state()),
    syncState: async () => (calls.push("syncState"), queue.shift() ?? state()),
    wait: async (ms) => void (t += ms),
    now: () => t,
    ...over,
  };
}

describe("pull to refresh", () => {
  it("syncs Apple Health first, then waits for the COROS sync", async () => {
    const d = deps({}, [state({ running: true }), state({ running: true }), state()]);
    expect(await refreshAll(d)).toEqual([]);
    expect(d.calls).toEqual(["healthkit", "syncNow", "syncState", "syncState"]);
  });

  it("skips Apple Health where it isn't available (Expo Go, web)", async () => {
    const d = deps({ healthKitAvailable: async () => false });
    await refreshAll(d);
    expect(d.calls).toEqual(["syncNow"]);
  });

  it("says what went wrong", async () => {
    expect(await refreshAll(deps({}, [state({ coros_auth: false })]))).toEqual(["COROS isn't connected (Settings › Connections)"]);
    expect(await refreshAll(deps({}, [state({ last_ok: false, last_error: "tools failed: querySleepHrv" })]))).toEqual(["COROS: tools failed: querySleepHrv"]);
    const hkDown = deps({ syncHealthKit: async () => { throw new Error("denied"); } });
    expect(await refreshAll(hkDown)).toEqual(["Apple Health: denied"]);
    const offline = deps({ syncNow: async () => { throw new Error("Network request failed"); } });
    expect(await refreshAll(offline)).toEqual(["Server: Network request failed"]);
  });

  it("stops waiting on a long sync", async () => {
    const d = deps({ syncState: async () => state({ running: true }) }, [state({ running: true })]);
    expect(await refreshAll(d)).toEqual(["COROS is still syncing; pull again in a minute"]);
    expect(d.now()).toBeGreaterThan(MAX_WAIT_MS);
  });
});
