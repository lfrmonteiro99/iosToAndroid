import React from 'react';
import { render, fireEvent, waitFor, act, RenderResult } from '../../test-utils';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ClockScreen } from '../ClockScreen';
import { createQuickAlarm } from '../../utils/alarmScheduling';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

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

const ALARMS_STORAGE_KEY = '@iostoandroid/alarms';
const ALARM_TIMEZONE_STORAGE_KEY = '@iostoandroid/alarm_scheduling_timezone';

interface StoredAlarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  days: number[];
  enabled: boolean;
  notificationIds: string[];
}

const ONE_SHOT_ALARM: StoredAlarm = {
  id: 'alarm-1',
  hour: 7,
  minute: 0,
  label: 'Wake up',
  days: [],
  enabled: true,
  notificationIds: ['scheduled-id-1'],
};

// --- AppState harness ------------------------------------------------------
// The production code registers its foreground handler through
// AppState.addEventListener; capturing the real handlers lets the tests drive a
// genuine background -> foreground transition instead of poking at component
// internals. Handlers are dropped again when the component unsubscribes, so an
// unmounted screen has no handler left to fire.
let changeHandlers: ((state: AppStateStatus) => void)[] = [];

function fireAppState(state: AppStateStatus) {
  [...changeHandlers].forEach((handler) => handler(state));
}

// --- Device timezone harness -----------------------------------------------
// Production reads the device zone via `new Intl.DateTimeFormat().resolvedOptions()`.
// Spying on the prototype keeps every other Intl behaviour (formatting a given
// IANA zone) real, so only the *device* zone is under test control.
let deviceTimezone: string | undefined = 'Europe/Lisbon';
const realResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;

// --- AsyncStorage harness --------------------------------------------------
// Stateful on purpose: production writes the timezone it scheduled against and
// then reads it back on the next check. A write-only stub would make a second
// foreground look like a fresh timezone change and hide double-scheduling.
let storage: Record<string, string> = {};

/**
 * Seeds stored alarms plus the timezone they were scheduled against. Both are
 * needed: production only reschedules when it can compare the device zone with
 * the zone the pending notifications were computed in, and that reference lives
 * in AsyncStorage so it survives the process being killed.
 */
function seedAlarms(alarms: StoredAlarm[], scheduledIn: string | null = 'Europe/Lisbon') {
  storage[ALARMS_STORAGE_KEY] = JSON.stringify(alarms);
  if (scheduledIn !== null) storage[ALARM_TIMEZONE_STORAGE_KEY] = scheduledIn;
}

function savedSchedulingTimezone(): string | null {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
    ([key]) => key === ALARM_TIMEZONE_STORAGE_KEY,
  );
  return calls.length === 0 ? null : calls[calls.length - 1][1];
}

function savedAlarms(): StoredAlarm[] | null {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
    ([key]) => key === ALARMS_STORAGE_KEY,
  );
  if (calls.length === 0) return null;
  return JSON.parse(calls[calls.length - 1][1]);
}

/** Mounts the screen and switches to the Alarm tab, waiting for storage to settle. */
async function renderAlarmTab(): Promise<RenderResult> {
  const api = render(<ClockScreen navigation={mockNavigation} />);
  fireEvent.press(api.getByText('Alarm'));
  await waitFor(() => expect(api.getByText('7:00 AM')).toBeTruthy());
  (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
  (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();
  (AsyncStorage.setItem as jest.Mock).mockClear();
  return api;
}

beforeEach(() => {
  changeHandlers = [];
  deviceTimezone = 'Europe/Lisbon';

  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, handler) => {
    if (type === 'change') changeHandlers.push(handler);
    return {
      remove: () => {
        changeHandlers = changeHandlers.filter((h) => h !== handler);
      },
    };
  });

  jest
    .spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions')
    .mockImplementation(function resolvedOptionsWithFakeDeviceZone(this: Intl.DateTimeFormat) {
      return { ...realResolvedOptions.call(this), timeZone: deviceTimezone as string };
    });

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
  (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
});

describe('ClockScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<ClockScreen navigation={mockNavigation} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders Clock title', () => {
    const { getByText } = render(<ClockScreen navigation={mockNavigation} />);
    expect(getByText('Clock')).toBeTruthy();
  });

  it('renders tab controls', () => {
    const { getByText } = render(<ClockScreen navigation={mockNavigation} />);
    expect(getByText('World Clock')).toBeTruthy();
    expect(getByText('Alarm')).toBeTruthy();
    expect(getByText('Stopwatch')).toBeTruthy();
    expect(getByText('Timer')).toBeTruthy();
  });

  it('switching to Stopwatch tab shows Start button', () => {
    const { getByText } = render(<ClockScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('Stopwatch'));
    expect(getByText('Start')).toBeTruthy();
  });

  it('switching to Timer tab shows timer display', () => {
    const { getByText } = render(<ClockScreen navigation={mockNavigation} />);
    fireEvent.press(getByText('Timer'));
    expect(getByText(/05:00/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Alarms vs. device timezone changes (issue #213)
//
// One-shot alarms are scheduled as a TIME_INTERVAL countdown, i.e. anchored to
// an absolute instant. A timezone change while the app is backgrounded leaves
// that countdown pointing at the wrong local wall-clock time, so the alarm has
// to be recomputed when the app comes back to the foreground.
// ---------------------------------------------------------------------------
describe('ClockScreen alarms — device timezone changes', () => {
  it('reschedules a one-shot alarm when the device timezone changed while backgrounded', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    await waitFor(() =>
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('scheduled-id-1'),
    );
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1));

    const trigger = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0].trigger;
    expect(trigger.type).toBe('timeInterval');
    expect(trigger.seconds).toBeGreaterThan(0);

    await waitFor(() => expect(savedAlarms()).not.toBeNull());
    expect(savedAlarms()).toEqual([
      { ...ONE_SHOT_ALARM, notificationIds: ['notification-id'] },
    ]);
  });

  it('does not reschedule when the app returns to the foreground in the same timezone', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    await act(async () => {
      fireAppState('active');
    });

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(savedAlarms()).toBeNull();
  });

  it('ignores non-active AppState transitions, then reschedules on the next active', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('background');
      fireAppState('inactive');
    });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();

    await act(async () => {
      fireAppState('active');
    });
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
  });

  it('reschedules once when foregrounded twice after a single timezone change', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });
    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireAppState('background');
      fireAppState('active');
    });

    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('leaves repeating alarms alone — weekly triggers already follow the local wall clock', async () => {
    seedAlarms([{ ...ONE_SHOT_ALARM, days: [2, 4], notificationIds: ['weekly-1', 'weekly-2'] }]);
    await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('leaves disabled alarms alone', async () => {
    seedAlarms([{ ...ONE_SHOT_ALARM, enabled: false, notificationIds: [] }]);
    await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(savedAlarms()).toBeNull();
  });

  it('does nothing when there are no alarms stored', async () => {
    seedAlarms([]);
    const api = render(<ClockScreen navigation={mockNavigation} />);
    fireEvent.press(api.getByText('Alarm'));
    await waitFor(() => expect(api.getByText('No alarms set')).toBeTruthy());
    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(api.getByText('No alarms set')).toBeTruthy();
  });

  it('skips rescheduling when the runtime cannot resolve a device timezone', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    // An Intl build without full ICU data reports an empty timeZone. Treating
    // that as "the zone changed" would reschedule every alarm against an
    // unknown offset, which is worse than leaving them as they are.
    deviceTimezone = undefined;
    await act(async () => {
      fireAppState('active');
    });

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });

  it('keeps the alarm enabled when rescheduling yields no notifications', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    // Notification permission revoked while the app was backgrounded.
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'denied',
      canAskAgain: false,
    });

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    await waitFor(() => expect(savedAlarms()).not.toBeNull());
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(savedAlarms()).toEqual([{ ...ONE_SHOT_ALARM, enabled: true, notificationIds: [] }]);
  });

  it('reschedules even when the Alarm tab is no longer mounted', async () => {
    // The traveller is far more likely to have some other screen open than to be
    // sitting on the Alarm tab when the device switches zones.
    seedAlarms([ONE_SHOT_ALARM]);
    const api = await renderAlarmTab();

    fireEvent.press(api.getByText('Stopwatch'));
    await waitFor(() => expect(api.getByText('Start')).toBeTruthy());
    expect(api.queryByText('7:00 AM')).toBeNull();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    await waitFor(() =>
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('scheduled-id-1'),
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(savedAlarms()).toEqual([{ ...ONE_SHOT_ALARM, notificationIds: ['notification-id'] }]),
    );
  });

  it('reschedules on a cold start that already happens in the new timezone', async () => {
    // No AppState transition is ever observed here: the process starts fresh
    // with the device already in Tokyo, which is exactly the case a
    // foreground-only, in-component check cannot see.
    seedAlarms([ONE_SHOT_ALARM], 'Europe/Lisbon');
    deviceTimezone = 'Asia/Tokyo';

    render(<ClockScreen navigation={mockNavigation} />);

    await waitFor(() =>
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('scheduled-id-1'),
    );
    await waitFor(() =>
      expect(savedAlarms()).toEqual([{ ...ONE_SHOT_ALARM, notificationIds: ['notification-id'] }]),
    );
    expect(changeHandlers.length).toBeGreaterThan(0); // listener registered, never fired
  });

  it('does nothing when no scheduling timezone was ever recorded', async () => {
    // First ever launch: no notification has been computed against any zone, so
    // there is nothing that could be anchored to the wrong one.
    seedAlarms([ONE_SHOT_ALARM], null);
    await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    expect(savedAlarms()).toBeNull();
  });

  it('records the new timezone so the next launch does not reschedule again', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    await waitFor(() => expect(savedSchedulingTimezone()).toBe('Asia/Tokyo'));
  });

  it('turning the alarm off cancels the id it was rescheduled to, not the stale one', async () => {
    // The reschedule happens outside the Alarm tab. If the mounted list kept the
    // ids it read on mount, this toggle would cancel a notification that no
    // longer exists and leave the live one pending — the alarm would ring after
    // the user switched it off.
    seedAlarms([ONE_SHOT_ALARM]);
    const api = await renderAlarmTab();

    deviceTimezone = 'Asia/Tokyo';
    (Notifications.scheduleNotificationAsync as jest.Mock).mockResolvedValue('rescheduled-id');
    await act(async () => {
      fireAppState('active');
    });
    await waitFor(() =>
      expect(savedAlarms()).toEqual([{ ...ONE_SHOT_ALARM, notificationIds: ['rescheduled-id'] }]),
    );
    (Notifications.cancelScheduledNotificationAsync as jest.Mock).mockClear();

    await act(async () => {
      fireEvent.press(api.getByRole('switch'));
    });

    await waitFor(() =>
      expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('rescheduled-id'),
    );
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalledWith(
      'scheduled-id-1',
    );
  });

  it('schedules once when the mount check and a foreground event overlap', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    deviceTimezone = 'Asia/Tokyo';

    // Hold the reference-timezone read open so the mount check is still in
    // flight when the foreground event arrives. Two reconciliations racing on
    // the same alarm would cancel one notification and schedule two.
    let releaseRead: () => void = () => {};
    const readGate = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    const passthrough = (AsyncStorage.getItem as jest.Mock).getMockImplementation()!;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === ALARM_TIMEZONE_STORAGE_KEY) await readGate;
      return passthrough(key);
    });

    render(<ClockScreen navigation={mockNavigation} />);
    act(() => {
      fireAppState('active');
    });
    await act(async () => {
      releaseRead();
    });

    await waitFor(() => expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1));
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Regression lock for behaviour that ALREADY ships in main (added by 77d58ad,
// never covered by a test). This is not what this change fixes — it exists so
// that removing WorldClockTab's foreground listener stops being silent.
// ---------------------------------------------------------------------------
describe('ClockScreen world clock — foreground refresh (pre-existing behaviour)', () => {
  const WORLD_TIME = /^\d{2}:\d{2}\s(AM|PM)$/;

  function renderedTimes(api: RenderResult): string[] {
    return api.getAllByText(WORLD_TIME).map((node) => node.props.children as string);
  }

  it('recomputes displayed times on foreground without waiting for the 1s interval', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2026-08-19T09:00:00Z'));
      const api = render(<ClockScreen navigation={mockNavigation} />);
      // Flush the AsyncStorage read without advancing any timer.
      await act(async () => {});

      const before = renderedTimes(api);
      expect(before.length).toBeGreaterThan(0);

      // Clock moves on while the app sits in the background. No timer is
      // advanced, so the 1000ms interval has not fired.
      jest.setSystemTime(new Date('2026-08-19T10:00:00Z'));
      act(() => {
        fireAppState('active');
      });

      const after = renderedTimes(api);
      expect(after).toHaveLength(before.length);
      expect(after).not.toEqual(before);
    } finally {
      jest.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Assistant-created alarms (issue #259)
//
// createQuickAlarm writes straight to storage from outside the component tree
// (the Siri screen is a transparent modal over a still-mounted ClockScreen), so
// a mounted AlarmTab has to learn about the new alarm through the module's
// listeners instead of only on mount.
// ---------------------------------------------------------------------------
describe('ClockScreen alarms — created by the assistant', () => {
  it('shows an alarm added by createQuickAlarm on an already mounted Alarm tab', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    const api = await renderAlarmTab();

    await act(async () => {
      await createQuickAlarm(19, 0);
    });

    await waitFor(() => expect(api.getByText('7:00 PM')).toBeTruthy());
    // The manually seeded alarm is still listed: append, not replace.
    expect(api.getByText('7:00 AM')).toBeTruthy();
  });

  it('persists the assistant alarm alongside the existing ones', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    await renderAlarmTab();

    await act(async () => {
      await createQuickAlarm(19, 0);
    });

    const saved = savedAlarms();
    expect(saved).not.toBeNull();
    expect(saved!.map((a) => [a.hour, a.minute])).toEqual([
      [7, 0],
      [19, 0],
    ]);
    expect(saved![1].days).toEqual([]);
    expect(saved![1].enabled).toBe(true);
  });
});
