import { resolveAutoLockDelay, AUTO_LOCK_MS } from '../autoLockUtils';

// Red step: before the fix, App.tsx had `const AUTO_LOCK_GRACE_MS = 5000` hardcoded.
// resolveAutoLockDelay did not exist — these tests would all fail (import error / wrong value).

describe('resolveAutoLockDelay', () => {
  it("returns null for 'Never' — no timer should be scheduled", () => {
    expect(resolveAutoLockDelay('Never')).toBeNull();
  });

  it("returns 30000 for '30 Seconds', not the old hardcoded 5000", () => {
    expect(resolveAutoLockDelay('30 Seconds')).toBe(30_000);
  });

  it("returns 60000 for '1 Minute'", () => {
    expect(resolveAutoLockDelay('1 Minute')).toBe(60_000);
  });

  it("returns 120000 for '2 Minutes'", () => {
    expect(resolveAutoLockDelay('2 Minutes')).toBe(120_000);
  });

  it("returns 300000 for '5 Minutes'", () => {
    expect(resolveAutoLockDelay('5 Minutes')).toBe(300_000);
  });

  it('returns 5000 fallback for unknown/legacy values', () => {
    expect(resolveAutoLockDelay('unknown')).toBe(5_000);
    expect(resolveAutoLockDelay('')).toBe(5_000);
  });

  it('AUTO_LOCK_MS map covers all picker options from DisplayBrightnessScreen', () => {
    const pickerOptions = ['30 Seconds', '1 Minute', '2 Minutes', '3 Minutes', '5 Minutes', 'Never'];
    for (const option of pickerOptions) {
      expect(option in AUTO_LOCK_MS).toBe(true);
    }
  });
});
