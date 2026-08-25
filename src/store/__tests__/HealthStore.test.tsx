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
  DailySteps,
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

  // ── Cumulative sensor contract ────────────────────────────────────────────
  //
  // expo-sensors' PedometerModule.kt keeps `stepsAtTheBeginning` and emits
  // `values[0] - stepsAtTheBeginning`, i.e. a total that GROWS with every
  // event since the listener was attached — never a per-event delta. The
  // sequences below are therefore monotonically increasing totals, and the
  // expected result is the growth between them, not their sum.
  const grantAndGetCallback = async () => {
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    return watchMock.mock.calls[0][0] as (r: unknown) => void;
  };

  it('accumulates the GROWTH of the cumulative counter, not each raw sample', async () => {
    renderStore();
    const cb = await grantAndGetCallback();
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 11 });
      cb({ steps: 26 });
    });
    // growth: 1 -> 11 (+10) -> 26 (+15) = 25. Summing the raw samples would be 38.
    expect(box.latest?.todaySteps).toBe(25);
    const written = JSON.parse(setItemMock.mock.calls.at(-1)![1] as string);
    expect(written).toEqual([{ date: localDateKey(), steps: 25 }]);
  });

  it('the first sample only establishes the baseline and adds nothing', async () => {
    renderStore();
    const cb = await grantAndGetCallback();
    await act(async () => {
      cb({ steps: 500 });
    });
    // The first event's value is the counter's starting point, not 500 steps
    // taken since the app opened — adding it would invent half a thousand steps.
    expect(box.latest?.todaySteps).toBe(0);
    expect(setItemMock).not.toHaveBeenCalled();
  });

  it('a repeated identical sample adds nothing (duplicate sensor event)', async () => {
    renderStore();
    const cb = await grantAndGetCallback();
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 11 });
      cb({ steps: 11 });
    });
    expect(box.latest?.todaySteps).toBe(10);
  });

  it('a counter restart re-baselines instead of double counting', async () => {
    renderStore();
    const cb = await grantAndGetCallback();
    await act(async () => {
      cb({ steps: 100 });
      cb({ steps: 120 });
      // Listener re-attached / device reboot: the native counter starts over.
      cb({ steps: 5 });
      cb({ steps: 9 });
    });
    // 100 (baseline) -> 120 (+20) -> 5 (restart, +0) -> 9 (+4) = 24.
    expect(box.latest?.todaySteps).toBe(24);
  });

  it('garbage samples never disturb the baseline', async () => {
    renderStore();
    const cb = await grantAndGetCallback();
    await act(async () => {
      cb({ steps: 10 });
      cb({ steps: NaN });
      cb({});
      cb({ steps: -3 });
      cb(null);
      cb({ steps: 30 });
    });
    // Only 10 -> 30 counts (+20); the invalid samples are dropped without
    // moving the baseline, so the final growth is still measured from 10.
    expect(box.latest?.todaySteps).toBe(20);
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

  it('a counter that never grows leaves todaySteps at 0 and writes nothing', async () => {
    renderStore();
    const cb = await grantAndGetCallback();
    await act(async () => {
      cb({ steps: 0 });
      cb({ steps: 0 });
      cb({ steps: 0 });
    });
    expect(box.latest?.todaySteps).toBe(0);
    expect(setItemMock).not.toHaveBeenCalled();
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

  it('exposes stepHistory hydrated from AsyncStorage on the context', async () => {
    const stored: DailySteps[] = [
      { date: '2026-08-01', steps: 100 },
      { date: '2026-08-02', steps: 200 },
    ];
    getItemMock.mockResolvedValue(JSON.stringify(stored));
    renderStore();
    await waitFor(() => expect(box.latest?.stepHistory).toEqual(stored));
  });

  it('starts with an empty stepHistory when there is no persisted history', async () => {
    getItemMock.mockResolvedValue(null);
    renderStore();
    await waitFor(() => expect(box.latest?.stepHistory).toEqual([]));
  });

  it('reflects a new day appended by the pedometer in stepHistory', async () => {
    const today = localDateKey();
    const prior: DailySteps[] = [{ date: '2020-01-01', steps: 5 }];
    getItemMock.mockResolvedValue(JSON.stringify(prior));
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
    // today's running total (growth 1 -> 11) is merged into history and exposed
    await waitFor(() =>
      expect(box.latest?.stepHistory).toEqual([
        { date: '2020-01-01', steps: 5 },
        { date: today, steps: 10 },
      ]),
    );
  });

  it('adds sensor growth ON TOP of the total restored from storage', async () => {
    const today = localDateKey();
    getItemMock.mockResolvedValue(JSON.stringify([{ date: today, steps: 42 }]));
    renderStore();
    await waitFor(() => expect(box.latest?.todaySteps).toBe(42));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      // A fresh subscription restarts the native counter at a low value; the
      // day's restored total must not be replaced by it.
      cb({ steps: 1 });
      cb({ steps: 11 });
    });
    expect(box.latest?.todaySteps).toBe(52);
    await waitFor(() => expect(box.latest?.stepHistory).toEqual([{ date: today, steps: 52 }]));
  });

  it('rolls the day over at midnight without restarting the sensor baseline', async () => {
    // Fronteira: o contador nativo NÃO reinicia à meia-noite, só o total do dia.
    jest.useFakeTimers({ now: new Date(2026, 7, 24, 23, 59, 0) });
    try {
      renderStore();
      const cb = await grantAndGetCallback();
      await act(async () => {
        cb({ steps: 100 });
        cb({ steps: 130 });
      });
      expect(box.latest?.todaySteps).toBe(30);

      jest.setSystemTime(new Date(2026, 7, 25, 0, 1, 0));
      await act(async () => {
        cb({ steps: 145 });
      });
      // O dia novo começa em 0 + crescimento (145 - 130), não em 30 + 15.
      expect(box.latest?.todaySteps).toBe(15);
      await waitFor(() =>
        expect(box.latest?.stepHistory).toEqual([
          { date: '2026-08-24', steps: 30 },
          { date: '2026-08-25', steps: 15 },
        ]),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('becomes ready even when the sensor module throws synchronously', async () => {
    availableMock.mockImplementation(() => {
      throw new Error('ExponentPedometer native module is not available');
    });
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    expect(box.latest?.isPedometerAvailable).toBe(false);
    expect(box.latest?.stepHistory).toEqual([]);
  });
});
