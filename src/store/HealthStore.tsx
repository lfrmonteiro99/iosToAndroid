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

  const historyRef = useRef<DailySteps[]>([]);
  const dayRef = useRef<string>(localDateKey());
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const mountedRef = useRef(true);
  // Última leitura CUMULATIVA vista nesta subscrição (ver startWatching).
  const lastCumulativeRef = useRef(0);

  // Hydrate the persisted history and probe the sensor once. `isReady` flips
  // even when the sensor is missing or the read fails, so the screen is never
  // stuck on a skeleton — an unavailable pedometer is a final answer, not a
  // pending one.
  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const probe = async () => {
      const [raw, available] = await Promise.all([
        AsyncStorage.getItem(HEALTH_DAILY_STEPS_KEY).catch((e) => {
          logger.warn('HealthStore', 'daily steps read failed', e);
          return null;
        }),
        Platform.OS === 'android'
          ? Pedometer.isAvailableAsync().catch((e) => {
              logger.warn('HealthStore', 'isAvailableAsync failed', e);
              return false;
            })
          : Promise.resolve(false),
      ]);
      if (cancelled) return;
      const history = parseHistory(raw);
      historyRef.current = history;
      const today = localDateKey();
      dayRef.current = today;
      const stored = history.find((h) => h.date === today);
      // Restore today's running total so an app restart does not reset the day
      // back to zero. Other days stay in the array for the aggregation consumer.
      if (stored) setTodaySteps(stored.steps);
      setIsPedometerAvailable(available === true);
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
    AsyncStorage.setItem(HEALTH_DAILY_STEPS_KEY, JSON.stringify(merged)).catch((e) => {
      logger.warn('HealthStore', 'daily steps write failed', e);
    });
  }, []);

  const startWatching = useCallback(() => {
    // Idempotent: a second grant (or a double tap on the button) must not
    // stack two subscriptions, which would double-count every step.
    if (subscriptionRef.current) return;
    // Cada subscrição recomeça a contagem cumulativa do zero no lado nativo
    // (o listener reseta `stepsAtTheBeginning`), logo a âncora recomeça também.
    lastCumulativeRef.current = 0;
    try {
      subscriptionRef.current = Pedometer.watchStepCount((result) => {
        if (!mountedRef.current) return;
        // `result.steps` é o total CUMULATIVO desde o início desta subscrição, e
        // não os passos deste evento: expo-sensors (PedometerModule.kt:21-32)
        // guarda `stepsAtTheBeginning = values[0] - 1` na primeira emissão e
        // emite sempre `values[0] - stepsAtTheBeginning`. Somar cada emissão
        // inflacionava o dia de forma quadrática em hardware real.
        const cumulative =
          typeof result?.steps === 'number' && Number.isFinite(result.steps) && result.steps >= 0
            ? result.steps
            : null;
        // Leitura impossível (ausente, NaN, negativa): descartada sem tocar na
        // âncora, para não creditar um salto absurdo na leitura válida seguinte.
        if (cumulative === null) return;
        const last = lastCumulativeRef.current;
        lastCumulativeRef.current = cumulative;
        // Contador a descer = recomeço (reboot do sensor, nova subscrição):
        // reancora e não credita nada, em vez de contar um delta negativo.
        if (cumulative < last) return;
        const delta = cumulative - last;
        if (delta <= 0) return;
        const today = localDateKey();
        setTodaySteps((prev) => {
          // Local date changed while the app stayed open: close the previous
          // day at its total and start the new one from this delta.
          const base = today === dayRef.current ? prev : 0;
          dayRef.current = today;
          const next = base + delta;
          persist(next, today);
          return next;
        });
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
    }),
    [todaySteps, isPedometerAvailable, permissionGranted, requestActivityPermission, isReady],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth(): HealthContextValue {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used within HealthProvider');
  return ctx;
}
