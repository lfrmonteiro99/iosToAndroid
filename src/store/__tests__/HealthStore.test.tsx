import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid } from 'react-native';
import { Pedometer } from 'expo-sensors';
import {
  HealthProvider,
  useHealth,
  AVERAGE_STRIDE_METERS,
  AVERAGE_KCAL_PER_STEP,
} from '../HealthStore';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <HealthProvider>{children}</HealthProvider>
);

/** Fires the callback `watchStepCount` registered, with a raw step count. */
function emitSteps(steps: number) {
  const cb = (Pedometer.watchStepCount as jest.Mock).mock.calls[0][0];
  cb({ steps });
}

beforeEach(() => {
  jest.clearAllMocks();
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  (Pedometer.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Pedometer.watchStepCount as jest.Mock).mockReturnValue({ remove: jest.fn() });
  jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('HealthStore derived estimates', () => {
  it('exposes todayDistanceKm and todayActiveEnergyKcal derived from todaySteps', async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    expect(result.current).toHaveProperty('todayDistanceKm');
    expect(result.current).toHaveProperty('todayActiveEnergyKcal');

    await act(async () => {
      await result.current.requestActivityPermission();
    });
    await act(async () => {
      emitSteps(10000);
    });

    expect(result.current.todaySteps).toBe(10000);
    expect(result.current.todayDistanceKm).toBeCloseTo(7.62, 5);
    expect(result.current.todayActiveEnergyKcal).toBeCloseTo(400, 5);
  });

  it('uses the documented average constants, not hard-coded numbers', async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});
    await act(async () => {
      await result.current.requestActivityPermission();
    });
    await act(async () => {
      emitSteps(3333);
    });

    expect(result.current.todayDistanceKm).toBeCloseTo(
      (3333 * AVERAGE_STRIDE_METERS) / 1000,
      6,
    );
    expect(result.current.todayActiveEnergyKcal).toBeCloseTo(3333 * AVERAGE_KCAL_PER_STEP, 6);
  });

  it('reports both derived metrics as 0 while todaySteps is 0', async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    expect(result.current.todaySteps).toBe(0);
    expect(result.current.todayDistanceKm).toBe(0);
    expect(result.current.todayActiveEnergyKcal).toBe(0);
  });

  it('keeps derived metrics at 0 when the permission request is denied', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue(
      PermissionsAndroid.RESULTS.DENIED,
    );
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    let granted = true;
    await act(async () => {
      granted = await result.current.requestActivityPermission();
    });

    expect(granted).toBe(false);
    expect(result.current.permissionGranted).toBe(false);
    expect(Pedometer.watchStepCount).not.toHaveBeenCalled();
    expect(result.current.todayDistanceKm).toBe(0);
    expect(result.current.todayActiveEnergyKcal).toBe(0);
  });

  it('does not prompt or subscribe when the pedometer is unavailable', async () => {
    (Pedometer.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    expect(result.current.isPedometerAvailable).toBe(false);

    let granted = true;
    await act(async () => {
      granted = await result.current.requestActivityPermission();
    });

    expect(granted).toBe(false);
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    expect(Pedometer.watchStepCount).not.toHaveBeenCalled();
    expect(result.current.todaySteps).toBe(0);
    expect(result.current.todayDistanceKm).toBe(0);
  });

  it('granting twice does not register a second watcher (no double counting)', async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    await act(async () => {
      await result.current.requestActivityPermission();
    });
    await act(async () => {
      await result.current.requestActivityPermission();
    });

    expect((Pedometer.watchStepCount as jest.Mock).mock.calls).toHaveLength(1);

    await act(async () => {
      emitSteps(100);
    });
    expect(result.current.todaySteps).toBe(100);
    expect(result.current.todayDistanceKm).toBeCloseTo(0.0762, 6);
  });

  it('resumes from the persisted total for today rather than restarting at 0', async () => {
    const todayKey = (() => {
      const d = new Date();
      return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
    })();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([{ date: todayKey, steps: 500 }]),
    );

    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    expect(result.current.todaySteps).toBe(500);
    expect(result.current.todayDistanceKm).toBeCloseTo(0.381, 5);

    await act(async () => {
      await result.current.requestActivityPermission();
    });
    await act(async () => {
      emitSteps(200);
    });

    // 500 banked + 200 since the subscription started.
    expect(result.current.todaySteps).toBe(700);
    expect(result.current.todayActiveEnergyKcal).toBeCloseTo(28, 5);
  });

  it('ignores a malformed persisted payload instead of producing NaN estimates', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{ not json');
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    expect(result.current.todaySteps).toBe(0);
    expect(Number.isNaN(result.current.todayDistanceKm)).toBe(false);
    expect(result.current.todayDistanceKm).toBe(0);
    expect(result.current.todayActiveEnergyKcal).toBe(0);
  });

  it('drops persisted entries with a non-numeric step count', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([{ date: '2020-01-01', steps: 'lots' }, { date: 'x' }]),
    );
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});

    expect(result.current.todaySteps).toBe(0);
    expect(result.current.todayDistanceKm).toBe(0);
  });

  it('ignores a negative step reading rather than producing a negative distance', async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});
    await act(async () => {
      await result.current.requestActivityPermission();
    });
    await act(async () => {
      emitSteps(-50);
    });

    expect(result.current.todaySteps).toBe(0);
    expect(result.current.todayDistanceKm).toBe(0);
    expect(result.current.todayActiveEnergyKcal).toBe(0);
  });

  it('does not persist the derived estimates', async () => {
    const { result } = renderHook(() => useHealth(), { wrapper });
    await act(async () => {});
    await act(async () => {
      await result.current.requestActivityPermission();
    });
    await act(async () => {
      emitSteps(1000);
    });

    const writes = (AsyncStorage.setItem as jest.Mock).mock.calls;
    expect(writes.length).toBeGreaterThan(0);
    for (const [, payload] of writes) {
      expect(payload).not.toContain('todayDistanceKm');
      expect(payload).not.toContain('todayActiveEnergyKcal');
    }
  });
});
