import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  ALARMS_STORAGE_KEY,
  createQuickAlarm,
  subscribeToAlarms,
  type Alarm,
} from '../alarmScheduling';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted', canAskAgain: true })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', WEEKLY: 'weekly', DATE: 'date' },
}));

let storage: Record<string, string> = {};

function storedAlarms(): Alarm[] {
  const raw = storage[ALARMS_STORAGE_KEY];
  return raw ? (JSON.parse(raw) as Alarm[]) : [];
}

const EXISTING: Alarm = {
  id: 'alarm-existing',
  hour: 7,
  minute: 0,
  label: 'Wake up',
  days: [],
  enabled: true,
  notificationIds: ['old-id'],
};

beforeEach(() => {
  storage = {};
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in storage ? storage[key] : null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((key: string, value: string) => {
    storage[key] = value;
    return Promise.resolve();
  });
  (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
    status: 'granted',
    canAskAgain: true,
  });
  (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('notification-id');
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('createQuickAlarm', () => {
  it('persists a one-shot enabled alarm under ALARMS_STORAGE_KEY', async () => {
    const alarm = await createQuickAlarm(19, 0);

    expect(alarm.hour).toBe(19);
    expect(alarm.minute).toBe(0);
    expect(alarm.days).toEqual([]);
    expect(alarm.enabled).toBe(true);

    const saved = storedAlarms();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual(alarm);
  });

  it('stores the notification ids returned by scheduleAlarmNotifications', async () => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('scheduled-xyz');
    const alarm = await createQuickAlarm(6, 30);

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(alarm.notificationIds).toEqual(['scheduled-xyz']);
    expect(storedAlarms()[0].notificationIds).toEqual(['scheduled-xyz']);
  });

  it('appends to existing alarms instead of overwriting them', async () => {
    storage[ALARMS_STORAGE_KEY] = JSON.stringify([EXISTING]);

    await createQuickAlarm(19, 0);

    const saved = storedAlarms();
    expect(saved).toHaveLength(2);
    expect(saved[0].id).toBe('alarm-existing');
    expect(saved[1].hour).toBe(19);
  });

  it('keeps both alarms when called twice in a row (repeated command)', async () => {
    const first = await createQuickAlarm(7, 15);
    const second = await createQuickAlarm(8, 45);

    const saved = storedAlarms();
    expect(saved).toHaveLength(2);
    expect(saved.map((a) => a.hour)).toEqual([7, 8]);
    expect(first.id).not.toBe(second.id);
  });

  it('uses the given label, trimmed, and falls back to "Alarm"', async () => {
    const labelled = await createQuickAlarm(9, 0, '  Gym  ');
    expect(labelled.label).toBe('Gym');

    const blank = await createQuickAlarm(10, 0, '   ');
    expect(blank.label).toBe('Alarm');

    const missing = await createQuickAlarm(11, 0);
    expect(missing.label).toBe('Alarm');
  });

  it('still persists with empty notificationIds when permission is denied', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });

    const alarm = await createQuickAlarm(19, 0);

    expect(alarm.notificationIds).toEqual([]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(storedAlarms()).toHaveLength(1);
    expect(storedAlarms()[0].enabled).toBe(true);
  });

  it('handles the boundary times 0:00 and 23:59', async () => {
    await createQuickAlarm(0, 0);
    await createQuickAlarm(23, 59);

    const saved = storedAlarms();
    expect(saved.map((a) => [a.hour, a.minute])).toEqual([
      [0, 0],
      [23, 59],
    ]);
  });

  it('notifies subscribers with the full updated list', async () => {
    storage[ALARMS_STORAGE_KEY] = JSON.stringify([EXISTING]);
    const listener = jest.fn();
    const unsubscribe = subscribeToAlarms(listener);

    try {
      const alarm = await createQuickAlarm(19, 0);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith([EXISTING, alarm]);
    } finally {
      unsubscribe();
    }
  });

  it('does not notify a subscriber that unsubscribed', async () => {
    const listener = jest.fn();
    subscribeToAlarms(listener)();

    await createQuickAlarm(19, 0);
    expect(listener).not.toHaveBeenCalled();
  });
});
