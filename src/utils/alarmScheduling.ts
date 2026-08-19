import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { withAutoLockSuppressed } from './permissions';
import { rememberSchedulingTimezone } from './alarmTimezone';

export const ALARMS_STORAGE_KEY = '@iostoandroid/alarms';

export interface Alarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  days: number[]; // 1=Sunday .. 7=Saturday (Expo weekday format)
  enabled: boolean;
  notificationIds: string[];
}

// ---------------------------------------------------------------------------
// Notification helpers
// ---------------------------------------------------------------------------
export async function requestNotificationPermissions(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === 'granted') return { granted: true, canAskAgain: true };
    if (!existing.canAskAgain) return { granted: false, canAskAgain: false };
    const result = await withAutoLockSuppressed(() => Notifications.requestPermissionsAsync());
    return { granted: result.status === 'granted', canAskAgain: result.canAskAgain };
  } catch {
    return { granted: false, canAskAgain: false };
  }
}

export async function scheduleAlarmNotifications(alarm: Alarm): Promise<string[]> {
  const perm = await requestNotificationPermissions();
  if (!perm.granted) return [];

  const ids: string[] = [];

  if (alarm.days.length === 0) {
    // One-shot alarm: schedule for next occurrence of this time
    const now = new Date();
    const target = new Date();
    target.setHours(alarm.hour, alarm.minute, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1);
    }
    const seconds = Math.floor((target.getTime() - now.getTime()) / 1000);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Alarm',
        body: alarm.label || 'Alarm',
        sound: true,
        categoryIdentifier: 'ALARM',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(seconds, 1),
        repeats: false,
      },
    });
    ids.push(id);
  } else {
    // Repeating alarm for each selected day
    for (const weekday of alarm.days) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Alarm',
          body: alarm.label || 'Alarm',
          sound: true,
          categoryIdentifier: 'ALARM',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: alarm.hour,
          minute: alarm.minute,
        },
      });
      ids.push(id);
    }
  }

  // The one-shot branch above bakes the current zone into an absolute countdown,
  // so record which zone that was. Only on a real schedule: a denied-permission
  // run scheduled nothing and must not move the reference.
  if (ids.length > 0) await rememberSchedulingTimezone();

  return ids;
}

export async function cancelAlarmNotifications(notificationIds: string[]): Promise<void> {
  for (const id of notificationIds) {
    await Notifications.cancelScheduledNotificationAsync(id);
  }
}

// ---------------------------------------------------------------------------
// AsyncStorage helpers
// ---------------------------------------------------------------------------
export async function loadAlarms(): Promise<Alarm[]> {
  try {
    const raw = await AsyncStorage.getItem(ALARMS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveAlarms(alarms: Alarm[]): Promise<void> {
  await AsyncStorage.setItem(ALARMS_STORAGE_KEY, JSON.stringify(alarms));
}

// ---------------------------------------------------------------------------
// Cross-component notification of rescheduled alarms
// ---------------------------------------------------------------------------
type AlarmsListener = (alarms: Alarm[]) => void;
const listeners = new Set<AlarmsListener>();

/**
 * Notifies a mounted alarm list that the stored alarms changed underneath it.
 * Rescheduling is driven from the provider tree, which stays mounted while the
 * Alarm tab does not; without this the tab would keep the notification ids it
 * read on mount and cancel already-replaced ids when the user toggles an alarm.
 */
export function subscribeToAlarms(listener: AlarmsListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Cancels and re-schedules every enabled one-shot alarm, then persists the new
 * notification ids. Returns the updated alarms, or null when there was nothing
 * to reschedule.
 */
export async function rescheduleOneShotAlarms(): Promise<Alarm[] | null> {
  const alarms = await loadAlarms();
  const stale = alarms.filter((a) => a.enabled && a.days.length === 0);
  if (stale.length === 0) return null;

  const newIdsByAlarm = new Map<string, string[]>();
  for (const alarm of stale) {
    await cancelAlarmNotifications(alarm.notificationIds);
    newIdsByAlarm.set(alarm.id, await scheduleAlarmNotifications(alarm));
  }

  // `enabled` is deliberately left as-is: if rescheduling produced no ids
  // (permissions revoked while backgrounded) the alarm stays on with an empty
  // id list, which is the state the "Fix 2" recovery effect in AlarmTab picks up
  // on the next launch. Flipping it off here would silently drop the alarm.
  const next = alarms.map((a) => {
    const ids = newIdsByAlarm.get(a.id);
    return ids ? { ...a, notificationIds: ids } : a;
  });

  await saveAlarms(next);
  listeners.forEach((listener) => listener(next));
  return next;
}
