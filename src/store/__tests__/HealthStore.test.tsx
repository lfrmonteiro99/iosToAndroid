import React from 'react';
import { render, act } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { HealthProvider, useHealth, HEALTH_DAILY_STEPS_KEY } from '../HealthStore';
import type { HealthContextValue } from '../HealthStore';

// Mock the Health Connect bridge so the test controls what the (native) module
// reports without ever touching `requireNativeModule` / a real device. The
// store statically imports `isAvailable` / `getTodayStepsFromHealthConnect` /
// `applyHealthConnectSteps` from this module; the factory below stands them in.
// The fns are stashed on `hcMock` (assigned inside the factory, never read as
// an outer const at factory-eval time) so the tests can drive them.
let hcMock: {
  isAvailable: jest.Mock<Promise<boolean>, []>;
  getTodayStepsFromHealthConnect: jest.Mock<Promise<number | null>, []>;
  applyHealthConnectSteps: jest.Mock<
    { date: string; steps: number }[],
    [{ date: string; steps: number }[], string, number]
  >;
};
jest.mock('../../../modules/health-connect-module/src', () => {
  hcMock = {
    isAvailable: jest.fn(async () => true),
    getTodayStepsFromHealthConnect: jest.fn(async () => 5000),
    applyHealthConnectSteps: jest.fn((history: { date: string; steps: number }[], today: string, steps: number) => [
      ...history.filter((e) => e.date !== today),
      { date: today, steps },
    ]),
  };
  return { __esModule: true, ...hcMock, default: hcMock };
});

// Capture the live context value on every render so async updates are readable.
// eslint-disable-next-line prefer-const -- binding is stable; we mutate `.current`.
let ctxRef: { current: HealthContextValue | null } = { current: null };
function Capture() {
  ctxRef.current = useHealth();
  return null;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

beforeEach(() => {
  jest.clearAllMocks();
  hcMock.isAvailable.mockResolvedValue(true);
  hcMock.getTodayStepsFromHealthConnect.mockResolvedValue(5000);
  hcMock.applyHealthConnectSteps.mockImplementation(
    (history: { date: string; steps: number }[], today: string, steps: number) => [
      ...history.filter((e) => e.date !== today),
      { date: today, steps },
    ],
  );
  (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
  (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  ctxRef.current = null;
});

// Let the fire-and-forget Health Connect probe resolve and commit to state.
async function settleProbe() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe('HealthStore — Health Connect availability + sync', () => {
  it('exposes isHealthConnectAvailable (false by default) and a syncFromHealthConnect no-op', () => {
    render(
      <HealthProvider>
        <Capture />
      </HealthProvider>,
    );
    const ctx = ctxRef.current!;
    expect(ctx.isHealthConnectAvailable).toBe(false);
    expect(typeof ctx.syncFromHealthConnect).toBe('function');
  });

  it('flips isHealthConnectAvailable to true when the module reports available', async () => {
    render(
      <HealthProvider>
        <Capture />
      </HealthProvider>,
    );
    await settleProbe();
    expect(ctxRef.current!.isHealthConnectAvailable).toBe(true);
  });

  it('returns false (no throw) from syncFromHealthConnect when Health Connect is absent', async () => {
    hcMock.isAvailable.mockResolvedValue(false);
    render(
      <HealthProvider>
        <Capture />
      </HealthProvider>,
    );
    await settleProbe();
    expect(ctxRef.current!.isHealthConnectAvailable).toBe(false);
    // The function is safe to call even though the screen never renders it.
    let ok = true;
    await act(async () => {
      ok = await ctxRef.current!.syncFromHealthConnect();
    });
    expect(ok).toBe(false);
  });

  it('returns false (no throw) when the native read resolves null (permission denied / no data)', async () => {
    hcMock.getTodayStepsFromHealthConnect.mockResolvedValue(null);
    render(
      <HealthProvider>
        <Capture />
      </HealthProvider>,
    );
    await settleProbe();
    let ok = true;
    await act(async () => {
      ok = await ctxRef.current!.syncFromHealthConnect();
    });
    expect(ok).toBe(false);
    // Local value untouched: it must NOT be clobbered with `null`.
    expect(ctxRef.current!.todaySteps).toBe(0);
  });

  it('REPLACES (does not sum) a non-zero local total on a successful sync', async () => {
    // Pre-seed a local Pedometer total of 100 steps for today, so the sync can
    // only prove replacement (final 5000) and not a sum (which would be 5100).
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([{ date: todayKey(), steps: 100 }]),
    );
    render(
      <HealthProvider>
        <Capture />
      </HealthProvider>,
    );
    await settleProbe();
    expect(ctxRef.current!.todaySteps).toBe(100); // local value restored on hydrate
    let ok = false;
    await act(async () => {
      ok = await ctxRef.current!.syncFromHealthConnect();
    });
    expect(ok).toBe(true);
    expect(ctxRef.current!.todaySteps).toBe(5000);
    expect(ctxRef.current!.todaySteps).not.toBe(5100);
    // The persisted history must carry the replaced entry, not a sum/duplicate.
    const today = ctxRef.current!.stepHistory.find((e) => e.date === todayKey());
    expect(today?.steps).toBe(5000);
    expect(hcMock.applyHealthConnectSteps).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      HEALTH_DAILY_STEPS_KEY,
      JSON.stringify([{ date: todayKey(), steps: 5000 }]),
    );
  });

  it('a double sync is idempotent — the same Health Connect total does not double', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify([{ date: todayKey(), steps: 100 }]),
    );
    render(
      <HealthProvider>
        <Capture />
      </HealthProvider>,
    );
    await settleProbe();
    await act(async () => {
      await ctxRef.current!.syncFromHealthConnect();
    });
    await act(async () => {
      await ctxRef.current!.syncFromHealthConnect();
    });
    // Still 5000, never 5000 + 5000 or 100 + 5000.
    expect(ctxRef.current!.todaySteps).toBe(5000);
    expect(ctxRef.current!.stepHistory.filter((e) => e.date === todayKey())).toHaveLength(1);
  });
});
