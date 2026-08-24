import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Pedometer } from 'expo-sensors';
import { logger } from '../utils/logger';

const STORAGE_KEY = '@iostoandroid/health_daily_steps';

// How often we re-check the local calendar date so the daily counter rolls over
// at midnight while the app stays open. Deliberately sub-minute: the check is
// what bounds how long a step can be filed under the wrong day, so it must be
// finer than the one-minute granularity it guards.
const DATE_ROLLOVER_INTERVAL_MS = 30_000;

// ---------------------------------------------------------------------------
// Derived-metric constants
//
// The pedometer reports a STEP COUNT and nothing else — it does not measure
// distance and it does not measure energy expenditure. Anything else shown on
// the Health dashboard is therefore an ESTIMATE derived from the step count via
// a population average, never a per-device reading. The app has no height or
// weight input (see `Profile` in ./ProfileStore.tsx), so no user-specific
// refinement is possible and none is faked.
// ---------------------------------------------------------------------------

/**
 * Average adult walking stride length in metres (~0.76 m). Population average
 * used only to turn a step count into an ESTIMATED distance.
 */
export const AVERAGE_STRIDE_METERS = 0.762;

/**
 * Average active energy burned per walking step in kcal (~0.04 kcal/step,
 * i.e. roughly 100 kcal per mile for an average adult). Population average
 * used only to turn a step count into an ESTIMATED active energy figure.
 */
export const AVERAGE_KCAL_PER_STEP = 0.04;

export interface DailySteps {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  steps: number;
}

interface HealthContextValue {
  todaySteps: number;
  /** Estimated, not measured: `todaySteps * AVERAGE_STRIDE_METERS / 1000`. */
  todayDistanceKm: number;
  /** Estimated, not measured: `todaySteps * AVERAGE_KCAL_PER_STEP`. */
  todayActiveEnergyKcal: number;
  isPedometerAvailable: boolean;
  /** `null` until we know; `false` when denied; `true` when granted. */
  permissionGranted: boolean | null;
  requestActivityPermission: () => Promise<boolean>;
  isReady: boolean;
}

const HealthContext = createContext<HealthContextValue | null>(null);

/** Local calendar day as `YYYY-MM-DD` (never UTC — the day must match the user's). */
export function localDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function HealthProvider({ children }: { children: React.ReactNode }) {
  const [history, setHistory] = useState<DailySteps[]>([]);
  const [today, setToday] = useState(() => localDateKey());
  const [isPedometerAvailable, setIsPedometerAvailable] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Steps already banked for `today` before the current watch subscription
  // started. `watchStepCount` reports the count SINCE the subscription began,
  // so the displayed total is baseline + that count.
  const baselineRef = useRef(0);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);

  const todaySteps = useMemo(
    () => history.find((h) => h.date === today)?.steps ?? 0,
    [history, today],
  );

  // Load persisted history, then probe pedometer availability.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let parsedHistory: DailySteps[] = [];
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            // Drop malformed entries so a corrupt payload cannot break the screen.
            parsedHistory = parsed.filter(
              (e): e is DailySteps =>
                !!e &&
                typeof e.date === 'string' &&
                typeof e.steps === 'number' &&
                Number.isFinite(e.steps) &&
                e.steps >= 0,
            );
          }
        }
      } catch (e) {
        logger.warn('HealthStore', 'failed to parse stored daily steps', e);
      }

      let available = false;
      try {
        available = await Pedometer.isAvailableAsync();
      } catch (e) {
        logger.warn('HealthStore', 'pedometer availability check failed', e);
        available = false;
      }

      if (cancelled) return;
      const key = localDateKey();
      baselineRef.current = parsedHistory.find((h) => h.date === key)?.steps ?? 0;
      setHistory(parsedHistory);
      setToday(key);
      setIsPedometerAvailable(available);
      setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after the first read has landed, so we never overwrite stored
  // history with the empty initial state.
  useEffect(() => {
    if (isReady) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  }, [history, isReady]);

  const recordSteps = useCallback((dateKey: string, steps: number) => {
    setHistory((prev) => {
      const existing = prev.find((h) => h.date === dateKey);
      if (existing) {
        if (existing.steps === steps) return prev;
        return prev.map((h) => (h.date === dateKey ? { ...h, steps } : h));
      }
      return [...prev, { date: dateKey, steps }];
    });
  }, []);

  const startWatching = useCallback(() => {
    // Guard against a double subscription: a second "grant" tap must not
    // register two listeners and double-count every step.
    if (subscriptionRef.current) return;
    try {
      subscriptionRef.current = Pedometer.watchStepCount((result) => {
        // `result.steps` is the count SINCE this subscription started.
        const since = typeof result?.steps === 'number' && result.steps > 0 ? result.steps : 0;
        recordSteps(localDateKey(), baselineRef.current + since);
      });
    } catch (e) {
      logger.warn('HealthStore', 'failed to subscribe to step count', e);
      subscriptionRef.current = null;
    }
  }, [recordSteps]);

  const requestActivityPermission = useCallback(async () => {
    // Android has no step history API here; without the pedometer there is
    // nothing to ask for and nothing to show.
    if (!isPedometerAvailable) {
      setPermissionGranted(false);
      return false;
    }
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
          {
            title: 'Activity Access',
            message: 'Allow this app to count your steps?',
            buttonPositive: 'Allow',
            buttonNegative: 'Deny',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setPermissionGranted(false);
          return false;
        }
      } catch (e) {
        logger.warn('HealthStore', 'activity permission request failed', e);
        setPermissionGranted(false);
        return false;
      }
    }
    setPermissionGranted(true);
    startWatching();
    return true;
  }, [isPedometerAvailable, startWatching]);

  // Midnight rollover: when the local date changes, re-baseline so the new day
  // starts from that day's stored total (0 for a fresh day) and the previous
  // day's entry stays intact for aggregation.
  useEffect(() => {
    const id = setInterval(() => {
      const key = localDateKey();
      setToday((prev) => {
        if (prev === key) return prev;
        baselineRef.current = 0;
        return key;
      });
    }, DATE_ROLLOVER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(
    () => () => {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    },
    [],
  );

  const value = useMemo<HealthContextValue>(
    () => ({
      todaySteps,
      todayDistanceKm: (todaySteps * AVERAGE_STRIDE_METERS) / 1000,
      todayActiveEnergyKcal: todaySteps * AVERAGE_KCAL_PER_STEP,
      isPedometerAvailable,
      permissionGranted,
      requestActivityPermission,
      isReady,
    }),
    [todaySteps, isPedometerAvailable, permissionGranted, requestActivityPermission, isReady],
  );

  return <HealthContext.Provider value={value}>{children}</HealthContext.Provider>;
}

export function useHealth() {
  const ctx = useContext(HealthContext);
  if (!ctx) throw new Error('useHealth must be used within HealthProvider');
  return ctx;
}
