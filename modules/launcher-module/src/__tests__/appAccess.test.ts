import type { AccessEvent, AppAccessCountMap } from '../index';

// Native module fixture (mirrors index.test.ts helpers): a Proxy that returns
// a rejecting/resolve mock for every method, overridable per test.
let mockNativeModule: Record<string, jest.Mock>;

jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => mockNativeModule),
}));

function makeNativeModule(
  reject: boolean,
  overrides: Record<string, jest.Mock> = {},
): Record<string, jest.Mock> {
  return new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'addListener') return undefined;
      if (prop in overrides) return overrides[prop as string];
      return jest.fn(() =>
        reject ? Promise.reject(new Error('native failure')) : Promise.resolve(true),
      );
    },
  }) as unknown as Record<string, jest.Mock>;
}

// Real notification-style listener module.
function makeNativeModuleWithListener(
  addListener: jest.Mock = jest.fn(() => ({ remove: jest.fn() })),
): Record<string, jest.Mock> {
  return new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'addListener') return addListener;
      return jest.fn(() => Promise.resolve(true));
    },
  }) as unknown as Record<string, jest.Mock>;
}

function loadBridge() {
  let mod: typeof import('../index');
  jest.isolateModules(() => {
    mod = jest.requireActual('../index');
  });
  return mod!;
}

const HOUR = 3600_000;

describe('app access bridge (issue #634)', () => {
  let mod: typeof import('../index');

  // Restores ONLY the clock spy. jest.restoreAllMocks() would also undo the
  // console.error silencing installed in beforeAll, which the rest of the suite
  // depends on.
  let nowSpy: jest.SpyInstance<number, []> | undefined;
  afterEach(() => {
    nowSpy?.mockRestore();
    nowSpy = undefined;
  });

  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });
  beforeEach(() => {
    mockNativeModule = makeNativeModule(false);
    mod = loadBridge();
  });

  it('getRecentAccessEvents forwards the native raw event list (capped by limit)', async () => {
    const events: AccessEvent[] = [
      { packageName: 'com.a', accessType: 'camera', timestamp: 1000, appName: 'A' },
      { packageName: 'com.b', accessType: 'microphone', timestamp: 2000, appName: 'B' },
    ];
    mockNativeModule = makeNativeModule(false, {
      getRecentAccessEvents: jest.fn(() => Promise.resolve(events)),
    });
    mod = loadBridge();

    const out = await mod.default.getRecentAccessEvents(10);
    expect(out).toHaveLength(2);
    expect(out[0].packageName).toBe('com.a');
  });

  // The bridge AGGREGATES the raw events into a per-package/type count map
  // using the shared util — this exercises the real util through the real
  // bridge, not a copy of it.
  it('getAppAccessCounts aggregates raw native events by package and type within the window', async () => {
    const t = Date.now() - (4 * HOUR + 5000);
    const events: AccessEvent[] = [
      { packageName: 'com.a', accessType: 'camera', timestamp: t },
      { packageName: 'com.a', accessType: 'camera', timestamp: t + HOUR },
      { packageName: 'com.a', accessType: 'microphone', timestamp: t + 2 * HOUR },
      { packageName: 'com.b', accessType: 'camera', timestamp: t + 3 * HOUR },
    ];
    mockNativeModule = makeNativeModule(false, {
      getRecentAccessEvents: jest.fn(() => Promise.resolve(events)),
    });
    mod = loadBridge();

    const counts = await mod.default.getAppAccessCounts(24) as AppAccessCountMap;
    expect(counts['com.a'].camera.count).toBe(2);
    expect(counts['com.a'].microphone.count).toBe(1);
    expect(counts['com.b'].camera.count).toBe(1);
  });

  it('getAppAccessCounts drops events outside the requested window', async () => {
    // Date.now is pinned, not sampled. The fixture put one event 5ms inside the
    // window and one 5ms outside, then let aggregateAppAccessByType take its own
    // Date.now() reading — so any scheduling delay above 5ms between building
    // the fixture and running the aggregation pushed the inside event out and
    // failed the test. It passed alone and failed in the full run, which is the
    // signature. Pinning keeps the assertion about the boundary (that is the
    // point of the test) while making the margin exact.
    const t = 1_700_000_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(t);
    const events: AccessEvent[] = [
      { packageName: 'com.a', accessType: 'camera', timestamp: t - 24 * HOUR - 5 },
      { packageName: 'com.b', accessType: 'camera', timestamp: t - 24 * HOUR + 5 },
    ];
    mockNativeModule = makeNativeModule(false, {
      getRecentAccessEvents: jest.fn(() => Promise.resolve(events)),
    });
    mod = loadBridge();

    const counts = await mod.default.getAppAccessCounts(24) as AppAccessCountMap;
    expect(counts['com.a']).toBeUndefined();
    expect(counts['com.b'].camera.count).toBe(1);
  });

  it('startAccessTrackingService / stopAccessTrackingService / isAccessTrackingServiceRunning pass through', async () => {
    mockNativeModule = makeNativeModule(false, {
      startAccessTrackingService: jest.fn(() => Promise.resolve(true)),
      stopAccessTrackingService: jest.fn(() => Promise.resolve(true)),
      isAccessTrackingServiceRunning: jest.fn(() => Promise.resolve(true)),
    });
    mod = loadBridge();
    await expect(mod.default.startAccessTrackingService()).resolves.toBe(true);
    await expect(mod.default.stopAccessTrackingService()).resolves.toBe(true);
    await expect(mod.default.isAccessTrackingServiceRunning()).resolves.toBe(true);
  });

  it('addAppAccessListener subscribes to onAppAccess and forwards the payload', () => {
    const addListener = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    mod = loadBridge();

    const handler = jest.fn();
    mod.addAppAccessListener(handler);

    expect(addListener).toHaveBeenCalledWith('onAppAccess', expect.any(Function));
    const nativeHandler = addListener.mock.calls[0][1];
    const payload: AccessEvent = { packageName: 'com.a', accessType: 'camera', timestamp: 123, appName: 'A' };
    nativeHandler(payload);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('addAppAccessListener unsubscribe calls the native subscription remove() exactly once', () => {
    const remove = jest.fn();
    const addListener = jest.fn(() => ({ remove }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    mod = loadBridge();
    const unsubscribe = mod.addAppAccessListener(jest.fn());
    unsubscribe();
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('addAppAccessListener degrades to a no-op unsubscribe when the native module has no event emitter', () => {
    mockNativeModule = makeNativeModule(false);
    mod = loadBridge();
    const handler = jest.fn();
    const unsubscribe = mod.addAppAccessListener(handler);
    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  // O caminho de erro: se a ponte nativa rejeitar, getAppAccessCounts NÃO pode
  // rebentar — tem de devolver {} e reportar o erro (igual aos outros métodos).
  it('getAppAccessCounts returns {} and reports a bridge error when the native call rejects', async () => {
    const errors: string[] = [];
    mockNativeModule = makeNativeModule(true);
    mod = loadBridge();
    mod.onBridgeError((method) => { errors.push(method); });

    await expect(mod.default.getAppAccessCounts(24)).resolves.toEqual({});
    expect(errors).toContain('getAppAccessCounts');
  });

  it('starts and stops the tracking service through the bridge without throwing on success', async () => {
    mockNativeModule = makeNativeModule(false, {
      startAccessTrackingService: jest.fn(() => Promise.resolve(true)),
      stopAccessTrackingService: jest.fn(() => Promise.resolve(true)),
    });
    mod = loadBridge();
    await expect(mod.default.startAccessTrackingService()).resolves.not.toThrow();
    await expect(mod.default.stopAccessTrackingService()).resolves.not.toThrow();
  });
});
