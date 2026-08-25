import { requireNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Native surface exposed by
 * `com.iostoandroid.health.HealthConnectModule` (Kotlin).
 *
 * Deliberately tiny: this module is read-only and availability-gated. Health
 * Connect is a separate installable app/service (bundled from Android 14, a
 * Play Store app before that), so it is absent on most emulators and on plenty
 * of real devices — every entry point here has to survive that.
 */
export interface HealthConnectModuleType {
  /** true only when `HealthConnectClient.getSdkStatus()` is SDK_AVAILABLE. */
  isAvailable(): Promise<boolean>;
  /**
   * Today's total step count from Health Connect's `StepsRecord`, or `null`
   * when the read permission is denied or Health Connect has no data.
   */
  getTodayStepsFromHealthConnect(): Promise<number | null>;
}

const isAndroid = Platform.OS === 'android';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- requireNativeModule returns an opaque native object; typing it as any is required for property access
let nativeModule: any = null;
if (isAndroid) {
  try {
    nativeModule = requireNativeModule('HealthConnectModule');
  } catch (e) {
    console.error('HealthConnectModule unavailable, using stub', e);
  }
}

/**
 * Stub used on non-Android and whenever the native module is missing.
 * Reports "not available" and "no data" rather than throwing, so callers never
 * need a try/catch of their own.
 */
const stub: HealthConnectModuleType = {
  isAvailable: async () => false,
  getTodayStepsFromHealthConnect: async () => null,
};

/**
 * Availability check. Never throws and never returns anything but a boolean:
 * a rejected native call, a missing function or a non-boolean return all
 * collapse to `false`, because "unknown" must behave exactly like "absent".
 */
export async function isAvailable(): Promise<boolean> {
  if (!nativeModule || typeof nativeModule.isAvailable !== 'function') return false;
  try {
    return (await nativeModule.isAvailable()) === true;
  } catch {
    return false;
  }
}

/**
 * Today's step total from Health Connect, gated on {@link isAvailable}.
 *
 * Returns `null` — never a fabricated 0 — when Health Connect is absent, the
 * permission is denied, the native call rejects, or the value is not a
 * non-negative finite integer. A `0` genuinely reported by Health Connect is
 * preserved as `0`: "no steps today" and "no data" are different answers and
 * callers must be able to tell them apart.
 */
export async function getTodayStepsFromHealthConnect(): Promise<number | null> {
  if (!(await isAvailable())) return null;
  if (typeof nativeModule?.getTodayStepsFromHealthConnect !== 'function') return null;
  let raw: unknown;
  try {
    raw = await nativeModule.getTodayStepsFromHealthConnect();
  } catch {
    return null;
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
    return null;
  }
  return raw;
}

/** One day of step history, as persisted by the JS side. */
export interface StepHistoryEntry {
  date: string;
  steps: number;
}

/**
 * Writes a Health-Connect-sourced step total into a step history, REPLACING
 * today's entry instead of adding to it.
 *
 * Health Connect's `StepsRecord` is the authoritative daily total; the locally
 * observed Pedometer delta measures the same steps a second time, so summing
 * the two would double-count. Other days are returned untouched and the
 * original array is never mutated.
 */
export function applyHealthConnectSteps(
  history: readonly StepHistoryEntry[],
  today: string,
  steps: number,
): StepHistoryEntry[] {
  const others = history.filter((e) => e.date !== today);
  return [...others, { date: today, steps }];
}

const healthConnect: HealthConnectModuleType = {
  isAvailable,
  getTodayStepsFromHealthConnect,
};

export const nativeStub = stub;
export default healthConnect;
