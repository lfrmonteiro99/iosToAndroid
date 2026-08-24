import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, act } from '@testing-library/react-native';
import { PermissionsAndroid, Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  HealthProvider,
  useHealth,
  mergeDailySteps,
  localDateKey,
  HEALTH_DAILY_STEPS_KEY,
} from '../HealthStore';

// Exercises the REAL provider: a probe component renders the live context and a
// ref hands the callbacks back to the test.
type Ctx = ReturnType<typeof useHealth>;
// Held in a box rather than a bare module variable so assigning it is not a
// render-time reassignment of an outer binding (react-hooks/globals).
const box: { latest: Ctx | null } = { latest: null };

function Probe() {
  const ctx = useHealth();
  box.latest = ctx;
  return (
    <Text testID="probe">
      {`ready=${ctx.isReady} steps=${ctx.todaySteps} avail=${ctx.isPedometerAvailable} perm=${String(ctx.permissionGranted)}`}
    </Text>
  );
}

function renderStore() {
  return render(
    <HealthProvider>
      <Probe />
    </HealthProvider>,
  );
}

const availableMock = Pedometer.isAvailableAsync as jest.Mock;
const watchMock = Pedometer.watchStepCount as jest.Mock;
// PermissionsAndroid.request is a real function on the RN module, not a jest.fn;
// spy on it so the ACTIVITY_RECOGNITION call can be asserted.
const requestMock = jest.spyOn(PermissionsAndroid, 'request');
const getItemMock = AsyncStorage.getItem as jest.Mock;
const setItemMock = AsyncStorage.setItem as jest.Mock;

describe('HealthStore', () => {
  beforeEach(() => {
    box.latest = null;
    jest.clearAllMocks();
    Platform.OS = 'android';
    availableMock.mockResolvedValue(true);
    watchMock.mockReturnValue({ remove: jest.fn() });
    requestMock.mockResolvedValue('granted' as never);
    getItemMock.mockResolvedValue(null);
    setItemMock.mockResolvedValue(undefined);
  });

  it('is ready with 0 steps and unasked permission before any grant', async () => {
    const { getByTestId } = renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    expect(box.latest?.todaySteps).toBe(0);
    expect(box.latest?.permissionGranted).toBeNull();
    expect(getByTestId('probe').props.children).toContain('steps=0');
    expect(watchMock).not.toHaveBeenCalled();
  });

  it('requests ACTIVITY_RECOGNITION and starts watching once granted', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    expect(requestMock).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      expect.objectContaining({ buttonPositive: 'Allow' }),
    );
    expect(box.latest?.permissionGranted).toBe(true);
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('accumulates CUMULATIVE sensor readings into todaySteps and persists them', async () => {
    // On Android, Pedometer.watchStepCount emits a CUMULATIVE count since the
    // observation started (first event is always 1 — the sensor's baseline
    // offset). The store must subtract the previous cumulative to recover the
    // real delta, not add the cumulative value itself.
    // Sequence [1, 11, 26] -> real steps walked = 26 - 1 = 25.
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 11 });
      cb({ steps: 26 });
    });
    expect(box.latest?.todaySteps).toBe(25);
    const written = JSON.parse(setItemMock.mock.calls.at(-1)![1] as string);
    expect(written).toEqual([{ date: localDateKey(), steps: 25 }]);
  });

  it('a second grant does not stack a second subscription (double tap)', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
      await box.latest!.requestActivityPermission();
    });
    expect(watchMock).toHaveBeenCalledTimes(1);
  });

  it('first cumulative event seeds the baseline and adds nothing (never sums the 1)', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 1 });
    });
    expect(box.latest?.todaySteps).toBe(0);
  });

  it('two cumulative events yield the difference, not the sum', async () => {
    // [1, 2] -> the user walked 1 step (2 - 1), not 3.
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 2 });
    });
    expect(box.latest?.todaySteps).toBe(1);
  });

  it('ignores a zero delta between two identical cumulative readings', async () => {
    // [1, 1, 11] -> first(1) seeds baseline, second(1) gives delta 0 (skipped),
    // third(11) gives delta 10 -> total 10.
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 1 });
      cb({ steps: 11 });
    });
    expect(box.latest?.todaySteps).toBe(10);
  });

  it('rolls over to a new local day at zero and counts the new day from its first delta', async () => {
    // Simulate the app crossing local midnight while open. The sensor reading
    // is always cumulative since observation start (never resets), so the
    // first event after midnight is delta = current - lastCumulative, and the
    // new day starts from 0 + that delta. Day 1: [1, 11] -> 10 steps (last
    // cumulative = 11). Day 2: reading 20 -> delta 20 - 11 = 9 -> new day
    // total 9 (steps that straddled midnight are attributed to day 2 — the
    // acknowledged approximation for the minimal slice).
    const realDate = Date.now;
    const day1 = new Date(2026, 0, 1, 23, 59, 58);
    const day2 = new Date(2026, 0, 2, 0, 0, 5);
    jest.spyOn(Date, 'now').mockReturnValue(day1.getTime());
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 11 });
    });
    expect(box.latest?.todaySteps).toBe(10);
    // Cross midnight.
    jest.spyOn(Date, 'now').mockReturnValue(day2.getTime());
    const keyOf = (d: Date) => {
      const y = d.getFullYear();
      const m = `${d.getMonth() + 1}`.padStart(2, '0');
      const dd = `${d.getDate()}`.padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };
    await act(async () => {
      cb({ steps: 20 });
    });
    expect(box.latest?.todaySteps).toBe(9);
    const written = JSON.parse(setItemMock.mock.calls.at(-1)![1] as string);
    expect(written).toEqual([
      { date: keyOf(day1), steps: 10 },
      { date: keyOf(day2), steps: 9 },
    ]);
    jest.spyOn(Date, 'now').mockRestore();
    (Date as unknown as { now: typeof realDate }).now = realDate;
  });

  it('does not request permission when the pedometer is unavailable', async () => {
    availableMock.mockResolvedValue(false);
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    expect(box.latest?.isPedometerAvailable).toBe(false);
    await act(async () => {
      await expect(box.latest!.requestActivityPermission()).resolves.toBe(false);
    });
    expect(requestMock).not.toHaveBeenCalled();
    expect(watchMock).not.toHaveBeenCalled();
    expect(box.latest?.todaySteps).toBe(0);
  });

  it('stays unavailable with 0 steps on non-android platforms', async () => {
    Platform.OS = 'ios';
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    expect(availableMock).not.toHaveBeenCalled();
    expect(box.latest?.isPedometerAvailable).toBe(false);
    expect(box.latest?.todaySteps).toBe(0);
  });

  it('denied permission leaves permissionGranted false and no watcher', async () => {
    requestMock.mockResolvedValue('denied' as never);
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await expect(box.latest!.requestActivityPermission()).resolves.toBe(false);
    });
    expect(box.latest?.permissionGranted).toBe(false);
    expect(watchMock).not.toHaveBeenCalled();
  });

  it('becomes ready even when isAvailableAsync rejects', async () => {
    availableMock.mockRejectedValue(new Error('no sensor service'));
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    expect(box.latest?.isPedometerAvailable).toBe(false);
  });

  it('restores today\u2019s persisted total and ignores other days', async () => {
    const today = localDateKey();
    getItemMock.mockResolvedValue(
      JSON.stringify([{ date: '2020-01-01', steps: 999 }, { date: today, steps: 42 }]),
    );
    renderStore();
    await waitFor(() => expect(box.latest?.todaySteps).toBe(42));
    expect(getItemMock).toHaveBeenCalledWith(HEALTH_DAILY_STEPS_KEY);
  });

  it('ignores unparseable persisted JSON instead of crashing', async () => {
    getItemMock.mockResolvedValue('{not json');
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    expect(box.latest?.todaySteps).toBe(0);
  });

  it('drops persisted entries with the wrong field types', async () => {
    getItemMock.mockResolvedValue(JSON.stringify([{ date: 5, steps: 'x' }, null]));
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    expect(box.latest?.todaySteps).toBe(0);
  });

  it('recovers deltas from cumulative readings, ignoring non-finite input', async () => {
    // {steps: 1} is the always-1 first event: it seeds the baseline and adds
    // nothing. {steps: 0} would be a non-finite-preceded reset -> treated as
    // missing (v=0) so it neither advances the baseline nor adds steps.
    // {steps: -5} gives a negative delta -> skipped. {steps: NaN} and {} both
    // yield v=0 (not finite) -> skipped. Final real delta is 0.
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: unknown) => void;
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 0 });
      cb({ steps: -5 });
      cb({ steps: NaN });
      cb({});
    });
    expect(box.latest?.todaySteps).toBe(0);
  });

  it('does not update state after unmount (late sensor callback)', async () => {
    const { unmount } = renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    const remove = watchMock.mock.results[0].value.remove as jest.Mock;
    unmount();
    expect(remove).toHaveBeenCalled();
    expect(() => cb({ steps: 5 })).not.toThrow();
  });

  it('mergeDailySteps keeps one entry per date and replaces the total', () => {
    expect(mergeDailySteps([], { date: '2026-01-01', steps: 1 })).toEqual([
      { date: '2026-01-01', steps: 1 },
    ]);
    expect(
      mergeDailySteps([{ date: '2026-01-01', steps: 1 }], { date: '2026-01-01', steps: 9 }),
    ).toEqual([{ date: '2026-01-01', steps: 9 }]);
    expect(
      mergeDailySteps([{ date: '2026-01-01', steps: 1 }], { date: '2026-01-02', steps: 3 }),
    ).toEqual([{ date: '2026-01-01', steps: 1 }, { date: '2026-01-02', steps: 3 }]);
  });

  it('localDateKey uses the LOCAL calendar day, zero-padded', () => {
    expect(localDateKey(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
    expect(localDateKey(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31');
  });

  it('useHealth throws outside the provider', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/HealthProvider/);
    spy.mockRestore();
  });
});
