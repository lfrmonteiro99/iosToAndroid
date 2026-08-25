/**
 * #784 — the Clock timer must be a reusable primitive, not screen-local state.
 *
 * Before the fix `TimerTab` held duration/remaining/running in `useState` with an
 * inline `setInterval`, so unmounting the Clock screen destroyed the countdown and
 * nothing outside the component could start or stop it.
 */
import React from 'react';
import { render, fireEvent, act } from '../../test-utils';
import { ClockScreen } from '../ClockScreen';
import { getTimerState, resetTimerStoreForTests, startTimer, stopTimer } from '../../store/timerStore';
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

function openTimerTab() {
  const utils = render(<ClockScreen navigation={mockNavigation} />);
  fireEvent.press(utils.getByText('Timer'));
  return utils;
}

describe('ClockScreen Timer tab is backed by the timer primitive (#784)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetTimerStoreForTests();
  });

  afterEach(() => {
    resetTimerStoreForTests();
    jest.useRealTimers();
  });

  it('keeps counting down after the screen unmounts and shows the survived value on remount', () => {
    const first = openTimerTab();
    fireEvent.press(first.getByLabelText('Start timer'));
    act(() => { jest.advanceTimersByTime(3000); });
    expect(first.getByText(/04:57/)).toBeTruthy();

    first.unmount();
    act(() => { jest.advanceTimersByTime(2000); });

    const second = openTimerTab();
    expect(second.getByText(/04:55/)).toBeTruthy();
    expect(second.getByLabelText('Pause timer')).toBeTruthy();
  });

  it('reflects startTimer() called from outside any component', () => {
    const utils = openTimerTab();
    act(() => { startTimer(120); });
    expect(utils.getByText(/02:00/)).toBeTruthy();
    act(() => { jest.advanceTimersByTime(1000); });
    expect(utils.getByText(/01:59/)).toBeTruthy();
  });

  it('reflects stopTimer() called from outside any component', () => {
    const utils = openTimerTab();
    act(() => { startTimer(120); jest.advanceTimersByTime(5000); });
    expect(utils.getByText(/01:55/)).toBeTruthy();
    act(() => { stopTimer(); });
    expect(utils.getByText(/02:00/)).toBeTruthy();
    expect(utils.getByLabelText('Start timer')).toBeTruthy();
  });

  it('pressing a preset updates the shared primitive, not just the screen', () => {
    const utils = openTimerTab();
    fireEvent.press(utils.getByLabelText('Set timer to 10 minutes'));
    expect(getTimerState()).toEqual({ duration: 600, remaining: 600, running: false });
    expect(utils.getByText(/10:00/)).toBeTruthy();
  });

  it('Cancel rearms at the configured duration (inverse of the fix: presets come back)', () => {
    const utils = openTimerTab();
    fireEvent.press(utils.getByLabelText('Start timer'));
    act(() => { jest.advanceTimersByTime(4000); });
    // Presets are hidden while running / part-way through.
    expect(utils.queryByLabelText('Set timer to 10 minutes')).toBeNull();

    fireEvent.press(utils.getByLabelText('Cancel timer'));
    expect(utils.getByText(/05:00/)).toBeTruthy();
    expect(utils.getByLabelText('Set timer to 10 minutes')).toBeTruthy();
  });

  it('reaching zero offers Restart and restarts from the full duration', () => {
    const utils = openTimerTab();
    act(() => { startTimer(2); });
    act(() => { jest.advanceTimersByTime(2000); });
    expect(utils.getByText(/00:00/)).toBeTruthy();
    fireEvent.press(utils.getByLabelText('Restart timer'));
    expect(utils.getByText(/00:02/)).toBeTruthy();
    expect(getTimerState().running).toBe(true);
  });

  it('double-tapping Start does not double the countdown speed', () => {
    const utils = openTimerTab();
    const start = utils.getByLabelText('Start timer');
    fireEvent.press(start);
    fireEvent.press(utils.getByLabelText('Pause timer'));
    fireEvent.press(utils.getByLabelText('Start timer'));
    act(() => { jest.advanceTimersByTime(1000); });
    expect(utils.getByText(/04:59/)).toBeTruthy();
  });
});
