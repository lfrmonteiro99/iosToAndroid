/**
 * Pure aggregation logic for the native "app access" feature (#634).
 *
 * The Kotlin side (`AccessEventsService` + `LauncherModule.getRecentAccessEvents`)
 * emits one raw event per sensor access it observes: `{ packageName, accessType,
 * timestamp }`. This module is the ONLY place that turns that flat list into the
 * per-package / per-type count map the UI renders. Keeping it framework-free and
 * out of the bridge means it is unit-testable under jest without a native module.
 *
 * The 24h window is inclusive at the lower bound: an event that happened exactly
 * `windowHours * 3600_000` ms ago is still "within the last N hours". We document
 * this explicitly because several OEM ROMs (MIUI, EMUI, ColorOS) report access
 * with truncated/rounded timestamps and the boundary is where that rounding
 * would otherwise drop a real access.
 */

export type AccessType = 'camera' | 'microphone' | 'location';

/**
 * Android runtime permission each access type maps to. Exposed so the JS UI can
 * drive the standard permission-rationale / settings deep-link without
 * hard-coding platform strings on the component side.
 */
export const ACCESS_TYPE_PERMISSION: Record<AccessType, string> = {
  camera: 'android.permission.CAMERA',
  microphone: 'android.permission.RECORD_AUDIO',
  location: 'android.permission.ACCESS_FINE_LOCATION',
};

/** Human-readable labels (kept in one place; PT-PT to match the app's locale). */
export const ACCESS_TYPE_LABELS: Record<AccessType, string> = {
  camera: 'Câmara',
  microphone: 'Microfone',
  location: 'Localização',
};

export interface RawAccessEvent {
  packageName: string;
  accessType: AccessType;
  timestamp: number;
  /** Optional app label; when absent the aggregator falls back to packageName. */
  appName?: string;
}

export interface AccessCount {
  packageName: string;
  /** Best-effort app label; the native side supplies it, falls back to packageName. */
  appName: string;
  count: number;
  /** Most recent access timestamp seen for this package/type (ms). */
  lastAccess: number;
}

export type AppAccessCounts = Record<AccessType, AccessCount>;

export type AppAccessCountMap = Record<string, AppAccessCounts>;

const HOUR_MS = 3600_000;

/**
 * Aggregate raw access events into a `{ packageName: { accessType: AccessCount } }`
 * map, keeping only events inside the trailing `windowHours` window.
 *
 * Determinism: outputs are sorted by `packageName` then by `accessType` so the
 * same input always produces the same stable object key order — callers that
 * diff or snapshot the result (none currently, but the screen could) won't see
 * key-order churn. Sorting also makes the primary UI list order predictable.
 */
export function aggregateAppAccessByType(
  events: RawAccessEvent[],
  windowHours: number,
): AppAccessCountMap {
  if (!Array.isArray(events)) return {};

  const now = Date.now();
  const lowerBound = now - windowHours * HOUR_MS;

  // Insertion-ordered map keyed by `packageName\0accessType`; collected into a
  // sorted result at the end.
  type Acc = { packageName: string; appName: string; count: number; lastAccess: number };
  const buckets = new Map<string, Acc>();

  for (const e of events) {
    // Malformed / hostile input from the native bridge is dropped, never
    // coerced into a bogus bucket: an event without a finite timestamp or a
    // usable packageName is not a real access (future-dated and NaN timestamps
    // also fall outside the window by construction).
    if (
      typeof e?.packageName !== 'string' ||
      e.packageName === '' ||
      (e.accessType !== 'camera' && e.accessType !== 'microphone' && e.accessType !== 'location') ||
      typeof e.timestamp !== 'number' ||
      !Number.isFinite(e.timestamp)
    ) {
      continue;
    }

    // Inclusive lower bound: an event exactly `windowHours` old is kept.
    if (e.timestamp < lowerBound || e.timestamp > now) {
      continue;
    }

    const key = `${e.packageName}\0${e.accessType}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.count += 1;
      if (e.timestamp > existing.lastAccess) existing.lastAccess = e.timestamp;
    } else {
      buckets.set(key, {
        packageName: e.packageName,
        appName: typeof e.appName === 'string' && e.appName !== '' ? e.appName : e.packageName,
        count: 1,
        lastAccess: e.timestamp,
      });
    }
  }

  const result: AppAccessCountMap = {};
  for (const packageName of [...buckets.keys()]
    .map((k) => k.split('\0', 1)[0])
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()) {
    const byType: AppAccessCounts = {} as AppAccessCounts;
    for (const type of ['camera', 'microphone', 'location'] as AccessType[]) {
      const acc = buckets.get(`${packageName}\0${type}`);
      if (acc) byType[type] = acc;
    }
    if (Object.keys(byType).length > 0) result[packageName] = byType;
  }
  return result;
}

// Re-exported so tests can assert the canonical permission constants without a
// second import line; avoids drifting copies of the string literals.
export const androidCameraPermission = ACCESS_TYPE_PERMISSION.camera;
export const androidMicPermission = ACCESS_TYPE_PERMISSION.microphone;
export const androidLocationPermission = ACCESS_TYPE_PERMISSION.location;
