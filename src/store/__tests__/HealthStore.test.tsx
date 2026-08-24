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

  // `steps` no callback do Pedometer é CUMULATIVO desde o início da subscrição
  // (expo-sensors PedometerModule.kt:21-32 ancora em `values[0] - 1` e emite
  // `values[0] - ancora`), não um delta por evento. Somar cada emissão inflaciona
  // o total de forma quadrática em hardware real.
  it('treats the watched steps as cumulative, not as a per-event delta', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 2 });
      cb({ steps: 3 });
    });
    // Três passos reais dão 3, não 1+2+3=6.
    expect(box.latest?.todaySteps).toBe(3);
    const written = JSON.parse(setItemMock.mock.calls.at(-1)![1] as string);
    expect(written).toEqual([{ date: localDateKey(), steps: 3 }]);
  });

  it('does not inflate the total on large cumulative readings', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 500 });
      cb({ steps: 1000 });
      cb({ steps: 1500 });
    });
    // Somar as emissões daria 3000 — mais do dobro dos passos reais.
    expect(box.latest?.todaySteps).toBe(1500);
  });

  it('a repeated cumulative reading adds nothing (no new steps)', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 10 });
      cb({ steps: 10 });
    });
    expect(box.latest?.todaySteps).toBe(10);
  });

  it('re-anchors when the cumulative counter restarts lower (reboot/re-subscribe)', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 50 });
    });
    expect(box.latest?.todaySteps).toBe(50);
    await act(async () => {
      cb({ steps: 5 }); // contador reiniciou: âncora nova, nada creditado
    });
    expect(box.latest?.todaySteps).toBe(50);
    await act(async () => {
      cb({ steps: 7 }); // +2 desde a nova âncora
    });
    expect(box.latest?.todaySteps).toBe(52);
  });

  it('adds the session cumulative on top of the persisted total for today', async () => {
    const today = localDateKey();
    getItemMock.mockResolvedValue(JSON.stringify([{ date: today, steps: 42 }]));
    renderStore();
    await waitFor(() => expect(box.latest?.todaySteps).toBe(42));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: { steps: number }) => void;
    await act(async () => {
      cb({ steps: 1 });
      cb({ steps: 2 });
    });
    expect(box.latest?.todaySteps).toBe(44);
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

  it('ignores negative, non-finite and missing readings without corrupting the anchor', async () => {
    renderStore();
    await waitFor(() => expect(box.latest?.isReady).toBe(true));
    await act(async () => {
      await box.latest!.requestActivityPermission();
    });
    const cb = watchMock.mock.calls[0][0] as (r: unknown) => void;
    await act(async () => {
      cb({ steps: 0 });
      cb({ steps: -5 });
      cb({ steps: NaN });
      cb({ steps: Infinity });
      cb({});
    });
    expect(box.latest?.todaySteps).toBe(0);
    // A leitura válida seguinte vale por si: as leituras lixo não deixaram uma
    // âncora absurda (com -5 como âncora isto daria 9).
    await act(async () => {
      cb({ steps: 4 });
    });
    expect(box.latest?.todaySteps).toBe(4);
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
