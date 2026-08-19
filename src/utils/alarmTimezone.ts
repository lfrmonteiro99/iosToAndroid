import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * IANA timezone the currently scheduled alarm notifications were computed
 * against. Persisted (rather than kept in a ref) so a cold start that happens
 * *after* the device already moved zones still sees the old value and can tell
 * the notifications are stale.
 */
export const ALARM_TIMEZONE_STORAGE_KEY = '@iostoandroid/alarm_scheduling_timezone';

/**
 * Current IANA timezone of the device, or null when the runtime cannot resolve
 * one (an Intl build without full ICU data reports an empty timeZone). Callers
 * must treat null as "unknown" and skip timezone-dependent work rather than
 * guessing a zone — guessing would reschedule alarms against the wrong offset.
 */
export function getDeviceTimezone(): string | null {
  const { timeZone } = new Intl.DateTimeFormat().resolvedOptions();
  return timeZone ? timeZone : null;
}

export async function readSchedulingTimezone(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(ALARM_TIMEZONE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Records the zone the caller just scheduled notifications in. No-op when unresolvable. */
export async function rememberSchedulingTimezone(): Promise<void> {
  const timezone = getDeviceTimezone();
  if (timezone === null) return;
  try {
    await AsyncStorage.setItem(ALARM_TIMEZONE_STORAGE_KEY, timezone);
  } catch {
    /* storage unavailable — the next successful schedule records it again */
  }
}

export type TimezoneSyncOutcome =
  /** Intl could not resolve a device zone — nothing is touched. */
  | 'unresolved-timezone'
  /** Nothing has ever been scheduled, so nothing can be anchored to a stale zone. */
  | 'no-reference'
  /** Device is still in the zone the notifications were computed against. */
  | 'unchanged'
  /** Device moved zones; one-shot alarms were cancelled and scheduled again. */
  | 'reconciled';

let inFlight: Promise<TimezoneSyncOutcome> | null = null;

async function run(): Promise<TimezoneSyncOutcome> {
  const timezone = getDeviceTimezone();
  if (timezone === null) return 'unresolved-timezone';

  const reference = await readSchedulingTimezone();
  // Anything that is not a stored zone string (missing key, storage stub that
  // resolves undefined) means nothing was ever scheduled against a known zone.
  if (typeof reference !== 'string' || reference.length === 0) return 'no-reference';
  if (reference === timezone) return 'unchanged';

  // Loaded lazily on purpose. `alarmScheduling` pulls in expo-notifications,
  // whose native module is unavailable outside the app runtime; importing it
  // eagerly from DeviceStore would drag it into every screen that mounts the
  // provider. Nothing here needs it until a drift is actually detected.
  // `require` rather than `import()`: jest without --experimental-vm-modules
  // rejects dynamic import callbacks, and module factories only run on first
  // require under Metro too, so this stays lazy in the app as well.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { rescheduleOneShotAlarms } = require('./alarmScheduling') as typeof import('./alarmScheduling');
  await rescheduleOneShotAlarms();

  await AsyncStorage.setItem(ALARM_TIMEZONE_STORAGE_KEY, timezone);
  return 'reconciled';
}

/**
 * Brings scheduled alarms back in line with the device timezone.
 *
 * One-shot alarms (`days === []`) are scheduled as a TIME_INTERVAL countdown,
 * i.e. anchored to an absolute instant, so a zone change leaves them firing at
 * the wrong local wall-clock time. Repeating alarms use WEEKLY triggers, which
 * the OS anchors to the local clock, and are deliberately left alone.
 *
 * Concurrent calls share one run: the provider syncs on mount and again on the
 * first foreground event, and two overlapping reconciliations would schedule
 * each alarm twice.
 */
export function syncAlarmsWithDeviceTimezone(): Promise<TimezoneSyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
