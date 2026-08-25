// Native module returned by requireNativeModule('HealthConnectModule').
// Swapped per test so each bridge instance captures the right behaviour.
let mockNativeModule: unknown;

jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => {
    if (mockNativeModule === undefined) throw new Error('module not found');
    return mockNativeModule;
  }),
}));

// Load a FRESH copy of the real bridge so the module-level
// requireNativeModule() call re-runs against the current mockNativeModule.
function loadBridge() {
  let mod: typeof import('../index');
  jest.isolateModules(() => {
    mod = jest.requireActual('../index');
  });
  return mod!;
}

beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => {
  (console.error as jest.Mock).mockRestore();
});

afterEach(() => {
  mockNativeModule = undefined;
});

describe('isAvailable', () => {
  it('is true only when the native module reports SDK_AVAILABLE', async () => {
    mockNativeModule = { isAvailable: jest.fn(async () => true) };
    await expect(loadBridge().isAvailable()).resolves.toBe(true);
  });

  it('is false when the native module reports unavailable', async () => {
    mockNativeModule = { isAvailable: jest.fn(async () => false) };
    await expect(loadBridge().isAvailable()).resolves.toBe(false);
  });

  it('is false (does not throw) when requireNativeModule throws', async () => {
    mockNativeModule = undefined;
    await expect(loadBridge().isAvailable()).resolves.toBe(false);
  });

  it('is false when the native call rejects', async () => {
    mockNativeModule = {
      isAvailable: jest.fn(async () => {
        throw new Error('native failure');
      }),
    };
    await expect(loadBridge().isAvailable()).resolves.toBe(false);
  });

  it('is false when the native module lacks the function entirely', async () => {
    mockNativeModule = {};
    await expect(loadBridge().isAvailable()).resolves.toBe(false);
  });

  it('is false — not truthy — when native returns a non-boolean truthy value', async () => {
    mockNativeModule = { isAvailable: jest.fn(async () => 'yes') };
    await expect(loadBridge().isAvailable()).resolves.toBe(false);
  });
});

describe('getTodayStepsFromHealthConnect', () => {
  function withSteps(steps: unknown, available = true) {
    mockNativeModule = {
      isAvailable: jest.fn(async () => available),
      getTodayStepsFromHealthConnect: jest.fn(async () => steps),
    };
    return loadBridge();
  }

  it('returns the step total when available', async () => {
    await expect(withSteps(8432).getTodayStepsFromHealthConnect()).resolves.toBe(8432);
  });

  it('preserves a genuine 0 (no steps today is not the same as no data)', async () => {
    await expect(withSteps(0).getTodayStepsFromHealthConnect()).resolves.toBe(0);
  });

  it('returns null without calling native when Health Connect is unavailable', async () => {
    const bridge = withSteps(5000, false);
    await expect(bridge.getTodayStepsFromHealthConnect()).resolves.toBeNull();
    expect(
      (mockNativeModule as { getTodayStepsFromHealthConnect: jest.Mock })
        .getTodayStepsFromHealthConnect,
    ).not.toHaveBeenCalled();
  });

  it('returns null when the permission is denied (native resolves null)', async () => {
    await expect(withSteps(null).getTodayStepsFromHealthConnect()).resolves.toBeNull();
  });

  it('returns null when the native read rejects', async () => {
    mockNativeModule = {
      isAvailable: jest.fn(async () => true),
      getTodayStepsFromHealthConnect: jest.fn(async () => {
        throw new Error('read failed');
      }),
    };
    await expect(loadBridge().getTodayStepsFromHealthConnect()).resolves.toBeNull();
  });

  it.each([
    ['a negative count', -1],
    ['a fractional count', 12.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a string', '9000'],
    ['undefined', undefined],
  ])('returns null for %s', async (_label, value) => {
    await expect(withSteps(value).getTodayStepsFromHealthConnect()).resolves.toBeNull();
  });

  it('returns null (no crash) when the module is absent altogether', async () => {
    mockNativeModule = undefined;
    await expect(loadBridge().getTodayStepsFromHealthConnect()).resolves.toBeNull();
  });
});

describe('applyHealthConnectSteps', () => {
  it("REPLACES today's entry instead of summing it", () => {
    const { applyHealthConnectSteps } = loadBridge();
    const out = applyHealthConnectSteps(
      [
        { date: '2026-01-01', steps: 100 },
        { date: '2026-01-02', steps: 3000 },
      ],
      '2026-01-02',
      8000,
    );
    expect(out).toEqual([
      { date: '2026-01-01', steps: 100 },
      { date: '2026-01-02', steps: 8000 },
    ]);
    // The inverse of a sum: 3000 + 8000 = 11000 must never appear.
    expect(out.find((e) => e.date === '2026-01-02')!.steps).not.toBe(11000);
  });

  it('appends when today has no entry yet', () => {
    const { applyHealthConnectSteps } = loadBridge();
    expect(applyHealthConnectSteps([{ date: '2026-01-01', steps: 100 }], '2026-01-02', 42)).toEqual([
      { date: '2026-01-01', steps: 100 },
      { date: '2026-01-02', steps: 42 },
    ]);
  });

  it('handles an empty history', () => {
    const { applyHealthConnectSteps } = loadBridge();
    expect(applyHealthConnectSteps([], '2026-01-02', 7)).toEqual([{ date: '2026-01-02', steps: 7 }]);
  });

  it('is idempotent when applied twice (double-tap must not double-count)', () => {
    const { applyHealthConnectSteps } = loadBridge();
    const once = applyHealthConnectSteps([{ date: '2026-01-02', steps: 3000 }], '2026-01-02', 8000);
    const twice = applyHealthConnectSteps(once, '2026-01-02', 8000);
    expect(twice).toEqual(once);
  });

  it('collapses duplicate entries for today into a single replaced entry', () => {
    const { applyHealthConnectSteps } = loadBridge();
    const out = applyHealthConnectSteps(
      [
        { date: '2026-01-02', steps: 1 },
        { date: '2026-01-02', steps: 2 },
      ],
      '2026-01-02',
      50,
    );
    expect(out).toEqual([{ date: '2026-01-02', steps: 50 }]);
  });

  it('does not mutate the input array', () => {
    const { applyHealthConnectSteps } = loadBridge();
    const input = [{ date: '2026-01-02', steps: 3000 }];
    applyHealthConnectSteps(input, '2026-01-02', 8000);
    expect(input).toEqual([{ date: '2026-01-02', steps: 3000 }]);
  });

  it('leaves other days untouched, including a 0-step day', () => {
    const { applyHealthConnectSteps } = loadBridge();
    const out = applyHealthConnectSteps(
      [
        { date: '2026-01-01', steps: 0 },
        { date: '2026-01-02', steps: 5 },
      ],
      '2026-01-02',
      9,
    );
    expect(out.find((e) => e.date === '2026-01-01')).toEqual({ date: '2026-01-01', steps: 0 });
  });
});
