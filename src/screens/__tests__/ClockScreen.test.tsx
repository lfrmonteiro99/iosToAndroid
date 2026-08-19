import React from 'react';
import { render, fireEvent, waitFor, act } from '../../test-utils';
import { ClockScreen } from '../ClockScreen';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AppNavigationProp } from '../../navigation/types';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() } as unknown as AppNavigationProp;

jest.mock('@react-native-async-storage/async-storage');

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', WEEKLY: 'weekly', DATE: 'date' },
}));

// Store the AppState listeners so we can trigger them in tests
const mockAppStateListeners: { [key: string]: ((state: AppStateStatus) => void)[] } = { change: [] };

// Mock AppState.addEventListener to track listeners
const originalAddEventListener = AppState.addEventListener;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
AppState.addEventListener = jest.fn((event: any, callback: (state: AppStateStatus) => void) => {
  if (event === 'change') {
    mockAppStateListeners.change.push(callback);
  }
  const originalListener = originalAddEventListener(event, callback);
  return {
    remove: () => {
      mockAppStateListeners.change = mockAppStateListeners.change.filter(l => l !== callback);
      originalListener.remove();
    },
  };
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

  it('recalculates world clock times immediately when app returns to foreground', async () => {
    // PROOF: When AppState fires 'active', the component calls setTick to force an immediate
    // re-render. The render calls getTimeForTimezone() fresh for each city, and if device
    // timezone changed (mocked here via Intl), the new time displays immediately — without
    // waiting for the next 1000ms interval tick.
    //
    // Test strategy:
    // 1. Mock AsyncStorage so cities load
    // 2. Mock Intl.DateTimeFormat to track calls and return different times
    // 3. Render and wait for cities to load
    // 4. Fire AppState 'active' listener (this calls setTick, forcing re-render)
    // 5. Verify format() was called again (proving re-render + recalculation happened)
    // 6. WITHOUT advancing fake timers (so the 1000ms interval hasn't fired)

    jest.useFakeTimers();

    try {
      // Mock AsyncStorage to return null (so default cities load)
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      // Track how many times format() was called per timezone
      const formatCallsPerTimezone: { [tz: string]: number } = {};

      const mockIntlDateTimeFormat = jest.fn(
        (locale, options) =>
          new Proxy(
            {},
            {
              get(target, prop) {
                if (prop === 'format') {
                  return () => {
                    const tz = options?.timeZone || 'UTC';
                    if (!formatCallsPerTimezone[tz]) formatCallsPerTimezone[tz] = 0;
                    formatCallsPerTimezone[tz]++;
                    // Return a simple time string (content doesn't matter, we're counting calls)
                    return '02:30 AM';
                  };
                }
                if (prop === 'formatToParts') {
                  return () => [
                    { type: 'timeZoneName', value: 'GMT+0' },
                  ];
                }
                if (prop === 'resolvedOptions') {
                  return () => ({ timeZone: options?.timeZone || 'UTC' });
                }
                return undefined;
              },
            }
          )
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global.Intl as any).DateTimeFormat = mockIntlDateTimeFormat;

      const { getByText } = render(<ClockScreen navigation={mockNavigation} />);

      // Wait for the tab to be visible (this means AsyncStorage has resolved and cities are loaded)
      await waitFor(() => {
        expect(getByText('World Clock')).toBeTruthy();
      });

      // At this point, getTimeForTimezone() has been called for each default city (5 cities).
      // Each call made Intl.DateTimeFormat().format() once.
      // Count the calls for Tokyo (one of the default cities)
      const initialTokyoCalls = formatCallsPerTimezone['Asia/Tokyo'] || 0;
      expect(initialTokyoCalls).toBeGreaterThan(0);

      // Capture the AppState listeners
      const listenersCopy = [...mockAppStateListeners.change];
      expect(listenersCopy.length).toBeGreaterThan(0);

      // Simulate app returning to foreground: fire the AppState 'active' listener.
      // This should trigger WorldClockTab's useEffect, which calls setTick().
      // setTick() forces a state change -> re-render -> getTimeForTimezone() called again
      // for each city.
      act(() => {
        listenersCopy.forEach(listener => listener('active'));
      });

      // CRITICAL: We did NOT call jest.advanceTimersByTime(1000) or jest.runOnlyPendingTimers().
      // So the 1000ms setInterval has NOT fired.
      // If format() was called again, it was because of the AppState listener's setTick(),
      // not the interval.

      // Verify the re-render happened: Tokyo's format() was called additional time(s)
      const finalTokyoCalls = formatCallsPerTimezone['Asia/Tokyo'] || 0;
      expect(finalTokyoCalls).toBeGreaterThan(initialTokyoCalls);

      // Verify the component still renders correctly
      expect(getByText('World Clock')).toBeTruthy();

    } finally {
      jest.useRealTimers();
    }
  });
});
