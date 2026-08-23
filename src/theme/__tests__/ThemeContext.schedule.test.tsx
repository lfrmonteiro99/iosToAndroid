import { resolveIsDark, isDarkBySchedule, parseHHMM } from '../ThemeContext';

/** Build a Date at the given local hour/minute for schedule assertions. */
function at(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('parseHHMM', () => {
  it('parses a valid HH:MM 24h string into minutes since midnight', () => {
    expect(parseHHMM('07:00')).toBe(7 * 60);
    expect(parseHHMM('19:30')).toBe(19 * 60 + 30);
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(23 * 60 + 59);
  });

  it('returns null for malformed or non-string input', () => {
    expect(parseHHMM('7:00')).toBe(7 * 60); // single-hour still parses
    expect(parseHHMM('7:5')).toBeNull();
    expect(parseHHMM('24:00')).toBeNull();
    expect(parseHHMM('12:60')).toBeNull();
    expect(parseHHMM('abc')).toBeNull();
    expect(parseHHMM('')).toBeNull();
    expect(parseHHMM(null)).toBeNull();
    expect(parseHHMM(undefined)).toBeNull();
  });
});

describe('isDarkBySchedule', () => {
  it('treats [lightUntil, darkUntil) as dark for a daytime schedule', () => {
    // light until 07:00, dark until 19:00
    expect(isDarkBySchedule(3 * 60, '07:00', '19:00')).toBe(false); // 03:00 light
    expect(isDarkBySchedule(7 * 60, '07:00', '19:00')).toBe(true); // 07:00 dark (inclusive)
    expect(isDarkBySchedule(12 * 60, '07:00', '19:00')).toBe(true); // noon dark
    expect(isDarkBySchedule(19 * 60, '07:00', '19:00')).toBe(false); // 19:00 light (exclusive)
    expect(isDarkBySchedule(22 * 60, '07:00', '19:00')).toBe(false); // 22:00 light
  });

  it('treats dark as spanning midnight for an overnight schedule', () => {
    // light until 19:00, dark until 07:00  → dark from 19:00 to 07:00
    expect(isDarkBySchedule(3 * 60, '19:00', '07:00')).toBe(true); // 03:00 dark
    expect(isDarkBySchedule(7 * 60, '19:00', '07:00')).toBe(false); // 07:00 light
    expect(isDarkBySchedule(12 * 60, '19:00', '07:00')).toBe(false); // noon light
    expect(isDarkBySchedule(19 * 60, '19:00', '07:00')).toBe(true); // 19:00 dark
    expect(isDarkBySchedule(22 * 60, '19:00', '07:00')).toBe(true); // 22:00 dark
  });

  it('returns null for invalid or degenerate schedules (equal endpoints)', () => {
    expect(isDarkBySchedule(100, '07:00', '07:00')).toBeNull();
    expect(isDarkBySchedule(100, 'not-a-time', '19:00')).toBeNull();
    expect(isDarkBySchedule(100, '07:00', '25:00')).toBeNull();
  });
});

describe('resolveIsDark', () => {
  it('forces dark for an explicit dark mode regardless of schedule or OS', () => {
    expect(resolveIsDark('dark', false, true, '07:00', '19:00', at(12))).toBe(true);
    expect(resolveIsDark('dark', true, false, '07:00', '19:00', at(3))).toBe(true);
  });

  it('forces light for an explicit light mode', () => {
    expect(resolveIsDark('light', true, true, '07:00', '19:00', at(22))).toBe(false);
  });

  it('follows the custom schedule when mode is system and automatic is on', () => {
    expect(resolveIsDark('system', true, true, '07:00', '19:00', at(12))).toBe(true); // noon → dark
    expect(resolveIsDark('system', true, true, '07:00', '19:00', at(3))).toBe(false); // 3am → light
    expect(resolveIsDark('system', false, true, '07:00', '19:00', at(3))).toBe(false); // OS irrelevant
  });

  it('ignores the schedule when automatic is off and follows the OS', () => {
    expect(resolveIsDark('system', true, false, '07:00', '19:00', at(12))).toBe(true); // OS dark wins
    expect(resolveIsDark('system', false, false, '07:00', '19:00', at(12))).toBe(false); // OS light
  });

  it('falls back to the OS when the schedule is degenerate, even if automatic', () => {
    // Equal-ish endpoints are rejected by isDarkBySchedule → OS governs.
    expect(resolveIsDark('system', true, true, '07:00', '07:00', at(12))).toBe(true);
    expect(resolveIsDark('system', false, true, '07:00', '07:00', at(12))).toBe(false);
  });

  it('reproduces the pre-existing behaviour when automatic is off and OS is light', () => {
    expect(resolveIsDark('system', false, false, '07:00', '19:00', at(0))).toBe(false);
  });
});
