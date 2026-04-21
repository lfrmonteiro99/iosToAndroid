// Unit test for the weekday mapping used when scheduling weekly reminders.
// Expo WeeklyTriggerInput.weekday: 1 = Sunday ... 7 = Saturday.

describe('RemindersScreen weekday mapping', () => {
  const toExpoWeekday = (d: Date) => d.getDay() + 1;

  it('maps Sunday → 1', () => {
    expect(toExpoWeekday(new Date('2024-01-07T12:00:00Z'))).toBe(1);
  });
  it('maps Wednesday → 4', () => {
    expect(toExpoWeekday(new Date('2024-01-10T12:00:00Z'))).toBe(4);
  });
  it('maps Saturday → 7', () => {
    expect(toExpoWeekday(new Date('2024-01-13T12:00:00Z'))).toBe(7);
  });
});
