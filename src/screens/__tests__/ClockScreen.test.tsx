import React from 'react';
import { render, fireEvent, waitFor, act, RenderResult } from '../../test-utils';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { ClockScreen } from '../ClockScreen';
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

function seedAlarms(alarms: StoredAlarm[]) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key === ALARMS_STORAGE_KEY ? JSON.stringify(alarms) : null),
  );
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

  (AsyncStorage.getItem as jest.Mock).mockImplementation(() => Promise.resolve(null));
  (AsyncStorage.setItem as jest.Mock).mockImplementation(() => Promise.resolve());
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

  it('stops reacting to foreground events once the Alarm tab is unmounted', async () => {
    seedAlarms([ONE_SHOT_ALARM]);
    const api = await renderAlarmTab();

    fireEvent.press(api.getByText('Stopwatch'));
    await waitFor(() => expect(api.getByText('Start')).toBeTruthy());

    deviceTimezone = 'Asia/Tokyo';
    await act(async () => {
      fireAppState('active');
    });

    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
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
