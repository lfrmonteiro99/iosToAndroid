import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { ClockScreen } from '../ClockScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), push: jest.fn() };


jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { TIME_INTERVAL: 'timeInterval', WEEKLY: 'weekly' },
}));

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
