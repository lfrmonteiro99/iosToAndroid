// Unit test for the weekday mapping used when scheduling weekly reminders.
// Expo WeeklyTriggerInput.weekday is 1..7 with 1 = Sunday.
// Date.getDay() is 0..6 with 0 = Sunday. Hence +1.
//
// This exercises the REAL scheduling path (scheduleReminderNotification) and
// asserts on the trigger actually passed to scheduleNotificationAsync — it does
// not re-implement the mapping in the test file.

import * as Notifications from 'expo-notifications';
import { scheduleReminderNotification } from '../RemindersScreen';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('notification-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  SchedulableTriggerInputTypes: { CALENDAR: 'calendar', DATE: 'date' },
}));

// Structural match of the screen's internal Reminder type — just the fields
// scheduleReminderNotification reads.
function weeklyReminder(dueDate: Date) {
  return {
    id: 'test-reminder',
    title: 'Test reminder',
    notes: '',
    completed: false,
    flagged: false,
    dueDate: dueDate.getTime(),
    listName: 'Reminders',
    createdAt: 1,
    recurrence: 'weekly' as const,
  };
}

function lastScheduledTrigger() {
  const mock = Notifications.scheduleNotificationAsync as jest.Mock;
  expect(mock).toHaveBeenCalled();
  const lastCall = mock.mock.calls[mock.mock.calls.length - 1];
  return lastCall[0].trigger;
}

describe('RemindersScreen weekly recurrence — weekday mapping', () => {
  beforeEach(() => {
    (Notifications.scheduleNotificationAsync as jest.Mock).mockClear();
  });

  it('maps a Sunday due date to weekday 1 (Expo 1 = Sunday)', async () => {
    // 2024-01-07 is a Sunday → Date.getDay() === 0 → weekday 1.
    await scheduleReminderNotification(weeklyReminder(new Date(2024, 0, 7, 12, 0, 0)));
    expect(lastScheduledTrigger().weekday).toBe(1);
  });

  it('maps a Wednesday due date to weekday 4', async () => {
    // 2024-01-10 is a Wednesday → Date.getDay() === 3 → weekday 4.
    await scheduleReminderNotification(weeklyReminder(new Date(2024, 0, 10, 12, 0, 0)));
    expect(lastScheduledTrigger().weekday).toBe(4);
  });

  it('maps a Saturday due date to weekday 7 (Expo 7 = Saturday)', async () => {
    // 2024-01-13 is a Saturday → Date.getDay() === 6 → weekday 7.
    await scheduleReminderNotification(weeklyReminder(new Date(2024, 0, 13, 12, 0, 0)));
    expect(lastScheduledTrigger().weekday).toBe(7);
  });
});
