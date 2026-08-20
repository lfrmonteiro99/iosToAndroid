import React from 'react';
import { render, fireEvent } from '../../test-utils';
import { RemindersScreen } from '../RemindersScreen';

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

const nav = { navigate: jest.fn(), goBack: jest.fn() } as never;

beforeEach(() => jest.clearAllMocks());

/** Enter the 'All' list view, then open the add-reminder bar. */
async function openAddBar(utils: ReturnType<typeof render>) {
  fireEvent.press(utils.getByText('All'));
  // The toolbar shows a "New Reminder" pressable button to open the input bar
  fireEvent.press(await utils.findByText('New Reminder'));
  return utils.findByPlaceholderText('New Reminder');
}

describe('RemindersScreen', () => {
  it('renders without crashing', () => {
    const { toJSON } = render(<RemindersScreen navigation={nav} />);
    expect(toJSON()).toBeTruthy();
  });

  it('home view shows smart list cards', () => {
    const { getByText } = render(<RemindersScreen navigation={nav} />);
    expect(getByText('Today')).toBeTruthy();
    expect(getByText('All')).toBeTruthy();
  });

  it('pressing All enters list view', async () => {
    const { getByText, findByText } = render(<RemindersScreen navigation={nav} />);
    fireEvent.press(getByText('All'));
    expect(await findByText('New Reminder')).toBeTruthy();
  });

  it('typing a reminder and submitting adds it to the list', async () => {
    const utils = render(<RemindersScreen navigation={nav} />);
    const input = await openAddBar(utils);
    fireEvent.changeText(input, 'Buy oat milk');
    fireEvent(input, 'submitEditing');
    expect(await utils.findByText('Buy oat milk')).toBeTruthy();
  });
});
