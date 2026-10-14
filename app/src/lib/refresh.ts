/** Pull-to-refresh: fetch new data from the sources, not just re-read the backend. Apple Health
 * goes first (the phone uploads its new samples), then a COROS sync on the server, which also
 * recomputes the scores for those days; then every screen reloads. */
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { api, errorText, type SyncStateOut } from "@/lib/api";
import { healthKitAvailable, syncHealthKit } from "@/lib/healthkit";

export interface RefreshDeps {
  healthKitAvailable: () => Promise<boolean>;
  syncHealthKit: () => Promise<unknown>;
  syncNow: () => Promise<SyncStateOut>;
  syncState: () => Promise<SyncStateOut>;
  wait: (ms: number) => Promise<void>;
  now: () => number;
}

export const POLL_MS = 2000;
export const MAX_WAIT_MS = 120_000; // a 3-day COROS sync with a FIT download or two

/** Runs both syncs; returns what went wrong, in words, or an empty list. */
export async function refreshAll(deps: RefreshDeps): Promise<string[]> {
  const problems: string[] = [];
  try {
    if (await deps.healthKitAvailable()) await deps.syncHealthKit();
  } catch (e) {
    problems.push(`Apple Health: ${errorText(e)}`);
  }
  try {
    let st = await deps.syncNow();
    const started = deps.now();
    while (st.running) {
      if (deps.now() - started > MAX_WAIT_MS) {
        problems.push("COROS is still syncing; pull again in a minute");
        return problems;
      }
      await deps.wait(POLL_MS);
      st = await deps.syncState();
    }
    if (!st.coros_auth) problems.push("COROS isn't connected (Settings › Connections)");
    else if (st.last_ok === false && st.last_error) problems.push(`COROS: ${st.last_error}`);
  } catch (e) {
    problems.push(`Server: ${errorText(e)}`);
  }
  return problems;
}

const DEPS: RefreshDeps = {
  healthKitAvailable,
  syncHealthKit,
  syncNow: () => api.syncNow(3), // last night and today; the server does the 30-day pass itself
  syncState: () => api.syncState(),
  wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

let inFlight: Promise<string[]> | null = null; // one refresh at a time, whichever tab started it

/** `refreshing` / `onRefresh` for a Screen, plus the last refresh's problems to show. */
export function useRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      inFlight ??= refreshAll(DEPS).finally(() => {
        inFlight = null;
      });
      setProblems(await inFlight);
    } finally {
      await qc.invalidateQueries();
      setRefreshing(false);
    }
  }, [qc]);
  return { refreshing, onRefresh, problems };
}
