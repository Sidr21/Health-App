/**
 * Apple Health -> backend sync (DESIGN §3.3).
 *
 * Reads the body/vitals quantity types with anchored queries so each run only returns new
 * samples, posts them to /ingest/apple-health, and stores the anchor per type. Background
 * delivery wakes the app so this runs without opening it.
 */
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { api, type HKSampleOut } from "./api";

export const HK_TYPES = [
  "HKQuantityTypeIdentifierBodyMass",
  "HKQuantityTypeIdentifierBodyMassIndex",
  "HKQuantityTypeIdentifierBodyFatPercentage",
  "HKQuantityTypeIdentifierLeanBodyMass",
  "HKQuantityTypeIdentifierHeight",
  "HKQuantityTypeIdentifierWaistCircumference",
  "HKQuantityTypeIdentifierBloodPressureSystolic",
  "HKQuantityTypeIdentifierBloodPressureDiastolic",
  "HKQuantityTypeIdentifierOxygenSaturation",
  "HKQuantityTypeIdentifierRespiratoryRate",
  "HKQuantityTypeIdentifierVO2Max",
  "HKQuantityTypeIdentifierDietaryWater",
  "HKQuantityTypeIdentifierDietaryCaffeine",
] as const;

export type HKType = (typeof HK_TYPES)[number];

/** Sleep stages (awake / core / deep / REM) for the hypnogram. COROS's API only has totals. */
export const HK_SLEEP = "HKCategoryTypeIdentifierSleepAnalysis" as const;

const anchorKey = (t: string) => `hk_anchor_${t.replace(/[^A-Za-z0-9]/g, "_")}`;

type HK = typeof import("@kingstinct/react-native-healthkit");

async function loadHK(): Promise<HK | null> {
  if (Platform.OS !== "ios") return null;
  try {
    return await import("@kingstinct/react-native-healthkit");
  } catch {
    return null; // Expo Go / web: native module absent
  }
}

export async function healthKitAvailable(): Promise<boolean> {
  const hk = await loadHK();
  if (!hk) return false;
  return hk.isHealthDataAvailable();
}

export async function requestHealthKitAccess(): Promise<boolean> {
  const hk = await loadHK();
  if (!hk) return false;
  return hk.requestAuthorization({ toRead: [...HK_TYPES, HK_SLEEP] });
}

export async function enableBackgroundDelivery(): Promise<void> {
  const hk = await loadHK();
  if (!hk) return;
  for (const t of [...HK_TYPES, HK_SLEEP]) {
    try {
      await hk.enableBackgroundDelivery(t, hk.UpdateFrequency.hourly);
    } catch {
      /* not fatal */
    }
  }
}

export interface SyncResult {
  stored: number;
  skipped: number;
  unknown_type: number;
  types: number;
}

/** One pass over every type; safe to call often (anchors make it incremental). */
export async function syncHealthKit(): Promise<SyncResult> {
  const hk = await loadHK();
  const result: SyncResult = { stored: 0, skipped: 0, unknown_type: 0, types: 0 };
  if (!hk) return result;
  for (const t of HK_TYPES) {
    const anchor = (await SecureStore.getItemAsync(anchorKey(t))) ?? undefined;
    const res = await hk.queryQuantitySamplesWithAnchor(t, { anchor, limit: 0 });
    const out: HKSampleOut[] = res.samples.map((s) => ({
      type: t,
      uuid: s.uuid,
      start: new Date(s.startDate).toISOString(),
      end: new Date(s.endDate).toISOString(),
      value: s.quantity,
      unit: s.unit,
      source: s.sourceRevision?.source?.bundleIdentifier ?? "unknown",
    }));
    if (out.length) {
      const r = await api.ingestAppleHealth(out);
      result.stored += r.stored;
      result.skipped += r.skipped;
      result.unknown_type += r.unknown_type;
    }
    if (res.newAnchor) await SecureStore.setItemAsync(anchorKey(t), res.newAnchor);
    result.types += 1;
  }
  // sleep analysis is a category type: value = HKCategoryValueSleepAnalysis (0 in bed ... 5 REM)
  const anchor = (await SecureStore.getItemAsync(anchorKey(HK_SLEEP))) ?? undefined;
  const sleep = await hk.queryCategorySamplesWithAnchor(HK_SLEEP, { anchor, limit: 0 });
  const out: HKSampleOut[] = sleep.samples.map((s) => ({
    type: HK_SLEEP,
    uuid: s.uuid,
    start: new Date(s.startDate).toISOString(),
    end: new Date(s.endDate).toISOString(),
    value: Number(s.value),
    unit: "",
    source: s.sourceRevision?.source?.bundleIdentifier ?? "unknown",
  }));
  if (out.length) {
    const r = await api.ingestAppleHealth(out);
    result.stored += r.stored;
    result.skipped += r.skipped;
  }
  if (sleep.newAnchor) await SecureStore.setItemAsync(anchorKey(HK_SLEEP), sleep.newAnchor);
  result.types += 1;
  return result;
}

/** Re-run the sync whenever HealthKit reports a change (foreground or background wake). */
export async function watchHealthKit(onSynced?: (r: SyncResult) => void): Promise<() => void> {
  const hk = await loadHK();
  if (!hk) return () => {};
  const subs = [...HK_TYPES, HK_SLEEP].map((t) =>
    hk.subscribeToChanges(t, () => {
      syncHealthKit().then(onSynced).catch(() => {});
    }),
  );
  return () => subs.forEach((s) => s.remove());
}
