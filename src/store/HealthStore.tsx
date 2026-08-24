import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { withAutoLockSuppressed } from '../utils/permissions';
import { logger } from '../utils/logger';

/** One persisted day of steps. `date` is the LOCAL calendar day, 'YYYY-MM-DD'. */
export interface DailySteps {
  date: string;
  steps: number;
}

export interface HealthContextValue {
  /** Steps accumulated for today's local date. 0 until permission is granted. */
  todaySteps: number;
  /** Whether the device actually exposes a step-counter sensor. */
  isPedometerAvailable: boolean;
  /** null = never asked yet. */
  permissionGranted: boolean | null;
  requestActivityPermission: () => Promise<boolean>;
  isReady: boolean;
  /** Full persisted day-by-day history, the same array written to AsyncStorage. */
  stepHistory: DailySteps[];
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

    void probe();

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

  const value = useMemo<HealthContextValue>(
    () => ({
      todaySteps,
      isPedometerAvailable,
      permissionGranted,
      requestActivityPermission,
      isReady,
      stepHistory,
    }),
    [todaySteps, isPedometerAvailable, permissionGranted, requestActivityPermission, isReady, stepHistory],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthContextValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used within HealthProvider');
  return ctx;
}
