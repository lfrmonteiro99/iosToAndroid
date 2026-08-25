import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { withAutoLockSuppressed } from '../utils/permissions';
import { logger } from '../utils/logger';
// Static import of the Health Connect bridge. The bridge is tiny and already
// defensive on its own: its `requireNativeModule('HealthConnectModule')` is
// wrapped in try/catch and falls back to a stub that reports "unavailable" /
// "no data", so importing it can never throw and the rest of the app never
// depends on Health Connect being present. (A dynamic `import()` is used in
// DeviceStore for the launcher module, but this repo's Jest does not enable
// --experimental-vm-modules, so dynamic import rejects here — the static
// import keeps the same safety guarantee and stays testable.)
import {
  type HealthConnectModuleType,
  type StepHistoryEntry,
  isAvailable as healthConnectIsAvailable,
  getTodayStepsFromHealthConnect as healthConnectGetSteps,
  applyHealthConnectSteps as healthConnectApplySteps,
} from '../../modules/health-connect-module/src';

// A single bridge object carrying all three surfaces, used as the "module is
// present" marker in `healthConnectModuleRef`. Its native calls are already
// defensive (null/stub on any failure), so holding it is safe on every device.
const healthConnectBridge: HealthConnectModuleType & {
  getTodayStepsFromHealthConnect: () => Promise<number | null>;
  applyHealthConnectSteps: (
    history: readonly StepHistoryEntry[],
    today: string,
    steps: number,
  ) => StepHistoryEntry[];
} = {
  isAvailable: healthConnectIsAvailable,
  getTodayStepsFromHealthConnect: healthConnectGetSteps,
  applyHealthConnectSteps: healthConnectApplySteps,
};

/** One persisted day of steps. `date` is the LOCAL calendar day, 'YYYY-MM-DD'. */
/**
 * Average adult walking stride length in metres (~0.76 m). Population average
 * used only to turn a step count into an ESTIMATED distance — there is no
 * height or weight input anywhere in the app, so no user-specific refinement
 * is possible and none is faked (#273).
 */
export const AVERAGE_STRIDE_METERS = 0.762;

/**
 * Average active energy burned per walking step in kcal (~0.04 kcal/step,
 * i.e. roughly 100 kcal per mile for an average adult). Same caveat as the
 * stride above: an estimate from a population average, not a measurement.
 */
export const AVERAGE_KCAL_PER_STEP = 0.04;

export interface DailySteps {
  date: string;
  steps: number;
}

export interface HealthContextValue {
  /** Steps accumulated for today's local date. 0 until permission is granted. */
  todaySteps: number;
  /** Estimated, not measured: `todaySteps * AVERAGE_STRIDE_METERS / 1000`. */
  todayDistanceKm: number;
  /** Estimated, not measured: `todaySteps * AVERAGE_KCAL_PER_STEP`. */
  todayActiveEnergyKcal: number;
  /** Whether the device actually exposes a step-counter sensor. */
  isPedometerAvailable: boolean;
  /** null = never asked yet. */
  permissionGranted: boolean | null;
  requestActivityPermission: () => Promise<boolean>;
  isReady: boolean;
  /** Full persisted day-by-day history, the same array written to AsyncStorage. */
  stepHistory: DailySteps[];
  /**
   * Whether Health Connect is installed and reports SDK_AVAILABLE. `false` on
   * every non-Android, every device without the app, and after any failure —
   * "unknown" must behave exactly like "absent", so the rest of the app never
   * depends on Health Connect being present.
   */
  isHealthConnectAvailable: boolean;
  /**
   * Read-only pull of today's steps from Health Connect, REPLACING (not
   * summing) the local Pedometer total. Returns `false` — a no-op — whenever
   * Health Connect is unavailable, the read permission is denied, the native
   * call rejects, or the value is unusable. Never throws, so callers never
   * need their own try/catch.
   */
  syncFromHealthConnect: () => Promise<boolean>;
}

export const HEALTH_DAILY_STEPS_KEY = '@iostoandroid/health_daily_steps';

/** Local calendar day as 'YYYY-MM-DD' (NOT UTC — the day boundary is the user's). */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Merge a day's running total into the persisted history. Exported so the
 * rollover/dedupe rule is testable without a sensor: one entry per date, the
 * newest total wins, order preserved with the current day last.
 */
export function mergeDailySteps(history: DailySteps[], entry: DailySteps): DailySteps[] {
  const others = history.filter((h) => h.date !== entry.date);
  return [...others, entry];
}

function parseHistory(raw: string | null): DailySteps[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is DailySteps =>
        !!e && typeof e.date === 'string' && typeof e.steps === 'number' && Number.isFinite(e.steps),
    );
  } catch (e) {
    logger.warn('HealthStore', 'failed to parse stored daily steps', e);
    return [];
  }
}

const HealthContext = createContext<HealthContextValue | null>(null);

export { HealthContext };

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [todaySteps, setTodaySteps] = useState(0);
  const [isPedometerAvailable, setIsPedometerAvailable] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isHealthConnectAvailable, setIsHealthConnectAvailable] = useState(false);

  const [stepHistory, setStepHistory] = useState<DailySteps[]>([]);
  const historyRef = useRef<DailySteps[]>([]);
  const dayRef = useRef<string>(localDateKey());
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);
  // Today's running total, mirrored outside React state so the sensor callback
  // computes the next total deterministically instead of doing it (and writing
  // to storage) inside a setState updater, which React may invoke twice.
  const todayStepsRef = useRef(0);
  // Last value seen from the pedometer. `null` = no sample yet, so the next one
  // only establishes the baseline. See startWatching for why.
  const lastCumulativeRef = useRef<number | null>(null);
  // The Health Connect bridge, already imported statically above. We keep a
  // cached `available` flag; the bridge itself is always present (its own
  // internal stub makes `requireNativeModule` failures harmless), so callers
  // only ever rely on the boolean, never on the native module being there.
  const healthConnectModuleRef = useRef<HealthConnectModuleType | null>(null);

  // Hydrate the persisted history and probe the sensor once. `isReady` flips
  // even when the sensor is missing or the read fails, so the screen is never
  // stuck on a skeleton — an unavailable pedometer is a final answer, not a
  // pending one.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const isAvailable = async (): Promise<boolean> => {
      if (Platform.OS !== 'android') return false;
      try {
        // Not just `.catch`: on a build where expo-sensors is missing, the
        // module proxy throws SYNCHRONOUSLY on the call, so there is no
        // promise to attach a handler to.
        return (await Pedometer.isAvailableAsync()) === true;
      } catch (e) {
        logger.warn('HealthStore', 'isAvailableAsync failed', e);
        return false;
      }
    };

    const probe = async () => {
      const [raw, available] = await Promise.all([
        AsyncStorage.getItem(HEALTH_DAILY_STEPS_KEY).catch((e) => {
          logger.warn('HealthStore', 'daily steps read failed', e);
          return null;
        }),
        isAvailable(),
      ]);
      if (cancelled) return;
      const history = parseHistory(raw);
      historyRef.current = history;
      setStepHistory(history);
      const today = localDateKey();
      dayRef.current = today;
      const stored = history.find((h) => h.date === today);
      // Restore today's running total so an app restart does not reset the day
      // back to zero. Other days stay in the array for the aggregation consumer.
      if (stored) {
        todayStepsRef.current = stored.steps;
        setTodaySteps(stored.steps);
      }
      setIsPedometerAvailable(available);
      setIsReady(true);
    };

    // Health Connect is a separate installable app/service, so it is absent on
    // most devices/emulators. Probing it must NEVER gate the screen, so it runs
    // fire-and-forget after the screen is already live. Any failure — missing
    // module, unavailable SDK, native rejection — collapses to `false`.
    const probeHealthConnect = async () => {
      // The bridge is statically imported and internally stubbed, so it is
      // always present and `isAvailable` never throws — but treat any surprise
      // as "unavailable" so a broken native surface can never flip the app.
      let hcAvailable = false;
      try {
        hcAvailable = (await healthConnectIsAvailable()) === true;
      } catch (e) {
        logger.warn('HealthStore', 'health-connect isAvailable failed', e);
        hcAvailable = false;
      }
      if (cancelled) return;
      // Stash the bridge so `syncFromHealthConnect` can refuse to run when Health
      // Connect is absent (defensive: the screen hides the button anyway).
      healthConnectModuleRef.current = hcAvailable ? healthConnectBridge : null;
      setIsHealthConnectAvailable(hcAvailable);
    };

    void probe();
    void probeHealthConnect();

    return () => {
      cancelled = true;
      mountedRef.current = false;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, []);

  const persist = useCallback((steps: number, date: string) => {
    const merged = mergeDailySteps(historyRef.current, { date, steps });
    historyRef.current = merged;
    setStepHistory(merged);
    AsyncStorage.setItem(HEALTH_DAILY_STEPS_KEY, JSON.stringify(merged)).catch((e) => {
      logger.warn('HealthStore', 'daily steps write failed', e);
    });
  }, []);

  const startWatching = useCallback(() => {
    // Idempotent: a second grant (or a double tap on the button) must not
    // stack two subscriptions, which would double-count every step.
    if (subscriptionRef.current) return;
    try {
      subscriptionRef.current = Pedometer.watchStepCount((result) => {
        if (!mountedRef.current) return;
        // `result.steps` is CUMULATIVE, not a delta: expo-sensors'
        // PedometerModule.kt latches `stepsAtTheBeginning` on the first sensor
        // event and then emits `values[0] - stepsAtTheBeginning`, a total that
        // only grows while the listener lives. Treating each sample as a delta
        // would add the whole running total on every event — 1, 11, 26 would
        // read as 38 steps instead of 25, inflating the day without bound on
        // real hardware.
        const cumulative =
          typeof result?.steps === 'number' && Number.isFinite(result.steps) && result.steps >= 0
            ? result.steps
            : null;
        // A garbage sample is dropped WITHOUT touching the baseline, so the
        // next valid sample is still measured from the last real reading.
        if (cumulative === null) return;

        const previous = lastCumulativeRef.current;
        lastCumulativeRef.current = cumulative;
        // First sample: it is the counter's starting point, not steps walked
        // since the app opened. It sets the baseline and adds nothing.
        if (previous === null) return;
        // A value below the baseline means the native counter restarted (the
        // listener was re-attached, or the device rebooted). Re-baseline —
        // never subtract, which would eat steps already counted.
        if (cumulative <= previous) return;

        const delta = cumulative - previous;
        const today = localDateKey();
        // Local date changed while the app stayed open: close the previous day
        // at its total and start the new one from this delta. The sensor
        // baseline is unaffected — the counter does not restart at midnight.
        const base = today === dayRef.current ? todayStepsRef.current : 0;
        dayRef.current = today;
        const next = base + delta;
        todayStepsRef.current = next;
        setTodaySteps(next);
        persist(next, today);
      });
    } catch (e) {
      logger.warn('HealthStore', 'watchStepCount failed', e);
      subscriptionRef.current = null;
    }
  }, [persist]);

  const requestActivityPermission = useCallback(async (): Promise<boolean> => {
    // A device with no step-counter cannot be fixed by a permission, so never
    // show the OS dialog for it — that would be asking for nothing.
    if (Platform.OS !== 'android' || !isPedometerAvailable) {
      setPermissionGranted(false);
      return false;
    }
    try {
      const granted = await withAutoLockSuppressed(() =>
        PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION, {
          title: 'Activity Access',
          message: 'Allow this app to count your steps?',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }),
      );
      const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
      setPermissionGranted(ok);
      if (ok) startWatching();
      return ok;
    } catch (e) {
      logger.warn('HealthStore', 'requestActivityPermission failed', e);
      setPermissionGranted(false);
      return false;
    }
  }, [isPedometerAvailable, startWatching]);

  const syncFromHealthConnect = useCallback(async (): Promise<boolean> => {
    // No-op when Health Connect was found to be absent during the probe. The
    // screen only shows the button when `isHealthConnectAvailable === true`,
    // but the guard here makes the function itself safe to call from anywhere.
    if (!healthConnectModuleRef.current) return false;
    // `getTodayStepsFromHealthConnect` is itself availability-gated and returns
    // `null` (never a fabricated 0) on any failure; `applyHealthConnectSteps`
    // REPLACES today's entry instead of summing it.
    let steps: number | null;
    try {
      steps = await healthConnectGetSteps();
    } catch (e) {
      logger.warn('HealthStore', 'syncFromHealthConnect read failed', e);
      return false;
    }
    // `null` means "no answer" (permission denied / no data) — not a step total
    // to write. Leave the local Pedometer value untouched rather than clobbering
    // it with nothing.
    if (steps === null) return false;
    // REPLACE today's entry with Health Connect's authoritative total. Health
    // Connect measures the same steps the Pedometer already counted, so summing
    // the two would double-count — never add.
    const merged = healthConnectApplySteps(historyRef.current, localDateKey(), steps);
    historyRef.current = merged;
    todayStepsRef.current = steps;
    setStepHistory(merged);
    setTodaySteps(steps);
    await AsyncStorage.setItem(HEALTH_DAILY_STEPS_KEY, JSON.stringify(merged)).catch((e) => {
      logger.warn('HealthStore', 'health-connect daily steps write failed', e);
    });
    return true;
  }, []);

  const value = useMemo<HealthContextValue>(
    () => ({
      todaySteps,
      todayDistanceKm: (todaySteps * AVERAGE_STRIDE_METERS) / 1000,
      todayActiveEnergyKcal: todaySteps * AVERAGE_KCAL_PER_STEP,
      isPedometerAvailable,
      permissionGranted,
      requestActivityPermission,
      isReady,
      stepHistory,
      isHealthConnectAvailable,
      syncFromHealthConnect,
    }),
    [
      todaySteps,
      isPedometerAvailable,
      permissionGranted,
      requestActivityPermission,
      isReady,
      stepHistory,
      isHealthConnectAvailable,
      syncFromHealthConnect,
    ],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthContextValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used within HealthProvider');
  return ctx;
}
