import type { LauncherModuleType } from '../index';

// The native module returned by requireNativeModule('LauncherModule').
// Swapped per test so each bridge instance captures the right behaviour.
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

// Native module fixture for the event-driven notification listeners: unlike
// makeNativeModule() (which hardcodes addListener to undefined), this exposes
// a real addListener so addNotificationListener/addNotificationRemovedListener
// can subscribe through it.
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

// Load the REAL bridge module, bypassing the jest.setup.js mock and the
// moduleNameMapper (which only matches the package-main import specifier).
// Each call gets a fresh module instance with its own listener set.
function loadBridge() {
  let mod: typeof import('../index');
  jest.isolateModules(() => {
    mod = jest.requireActual('../index');
  });
  return mod!;
}

describe('LauncherModule bridge error reporting', () => {
  let mod: typeof import('../index');
  let listener: jest.Mock;
  let unsubscribe: () => void;

  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });

  beforeEach(() => {
    mockNativeModule = makeNativeModule(true);
    mod = loadBridge();
    listener = jest.fn();
    unsubscribe = mod.onBridgeError(listener);
  });

  afterEach(() => {
    unsubscribe();
  });

  it('reports getWifiInfo failures to onBridgeError listeners', async () => {
    // After #371: getWifiInfo returns null on bridge error (not the default object)
    // so callers can distinguish failure from "Wi-Fi off"
    await expect(mod.default.getWifiInfo()).resolves.toBeNull();
    expect(listener).toHaveBeenCalledWith('getWifiInfo', expect.any(Error));
  });

  it('reports failures for every bridge method', async () => {
    const methods = Object.keys(mod.default) as (keyof LauncherModuleType)[];
    for (const method of methods) {
      const fn = (mod.default as unknown as Record<string, () => Promise<unknown>>)[method];
      await expect(fn()).resolves.toBeDefined();
      expect(listener).toHaveBeenCalledWith(method, expect.any(Error));
    }
  });

  it('does not report when the native call succeeds', async () => {
    mockNativeModule = makeNativeModule(false);
    mod = loadBridge();
    const okListener = jest.fn();
    const unsub = mod.onBridgeError(okListener);
    await expect(mod.default.getWifiInfo()).resolves.toBe(true);
    expect(okListener).not.toHaveBeenCalled();
    unsub();
  });

  it('reports a launchApp rejection (native returns false) to onBridgeError listeners', async () => {
    mockNativeModule = makeNativeModule(false, {
      launchApp: jest.fn().mockResolvedValue(false),
    });
    mod = loadBridge();
    const okListener = jest.fn();
    const unsub = mod.onBridgeError(okListener);
    await expect(mod.default.launchApp('com.nonexistent.app')).resolves.toBe(false);
    expect(okListener).toHaveBeenCalledWith('launchApp', expect.any(Error));
    unsub();
  });

  it('does not report when launchApp succeeds', async () => {
    mockNativeModule = makeNativeModule(false, {
      launchApp: jest.fn().mockResolvedValue(true),
    });
    mod = loadBridge();
    const okListener = jest.fn();
    const unsub = mod.onBridgeError(okListener);
    await expect(mod.default.launchApp('com.android.settings')).resolves.toBe(true);
    expect(okListener).not.toHaveBeenCalled();
    unsub();
  });

  it('stops reporting after unsubscribing', async () => {
    unsubscribe();
    await mod.default.getWifiInfo();
    expect(listener).not.toHaveBeenCalled();
  });

  it('reportBridgeError notifies every listener', () => {
    const l1 = jest.fn();
    const l2 = jest.fn();
    mod.onBridgeError(l1);
    mod.onBridgeError(l2);
    const err = new Error('boom');
    mod.reportBridgeError('getVolume', err);
    expect(l1).toHaveBeenCalledWith('getVolume', err);
    expect(l2).toHaveBeenCalledWith('getVolume', err);
  });

  it('a throwing listener does not prevent other listeners from being notified', () => {
    const throwing = jest.fn(() => {
      throw new Error('listener boom');
    });
    const ok = jest.fn();
    mod.onBridgeError(throwing);
    mod.onBridgeError(ok);
    mod.reportBridgeError('getVolume', new Error('boom'));
    expect(ok).toHaveBeenCalledWith('getVolume', expect.any(Error));
  });
});

// H2 (#196): notifications used to arrive via a 30s setInterval poll of
// getNotifications(). These lock the event-driven replacement — subscribing
// through the native module's own event emitter — so a regression back to
// polling, or a broken unsubscribe, fails a test instead of shipping silently.
describe('LauncherModule notification listeners (event-driven, #196)', () => {
  it('addNotificationListener subscribes to onNotificationPosted and forwards the payload as-is', () => {
    const addListener = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const handler = jest.fn();
    mod.addNotificationListener(handler);

    expect(addListener).toHaveBeenCalledWith('onNotificationPosted', expect.any(Function));

    const nativeHandler = addListener.mock.calls[0][1];
    const payload = {
      id: 'n1', key: 'k1', packageName: 'com.test.app',
      title: 'Hi', text: 'Body', time: 123, isOngoing: false,
    };
    nativeHandler(payload);

    expect(handler).toHaveBeenCalledWith(payload);
  });

  it('addNotificationListener unsubscribe calls the native subscription remove() exactly once', () => {
    const remove = jest.fn();
    const addListener = jest.fn(() => ({ remove }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const unsubscribe = mod.addNotificationListener(jest.fn());
    expect(remove).not.toHaveBeenCalled();

    unsubscribe();
    unsubscribe(); // calling twice must not double-invoke or throw
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('addNotificationRemovedListener subscribes to onNotificationRemoved and forwards only the id string', () => {
    const addListener = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const handler = jest.fn();
    mod.addNotificationRemovedListener(handler);

    expect(addListener).toHaveBeenCalledWith('onNotificationRemoved', expect.any(Function));

    const nativeHandler = addListener.mock.calls[0][1];
    nativeHandler({ id: 'n2', packageName: 'com.test.app' });

    // The removed-listener's contract is `(id: string) => void`, not the raw
    // native payload — a caller matching on payload.packageName would break.
    expect(handler).toHaveBeenCalledWith('n2');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]).toHaveLength(1);
  });

  it('addNotificationRemovedListener unsubscribe calls the native subscription remove()', () => {
    const remove = jest.fn();
    const addListener = jest.fn(() => ({ remove }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const unsubscribe = mod.addNotificationRemovedListener(jest.fn());
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('addNotificationListener degrades to a no-op unsubscribe when the native module exposes no event emitter', () => {
    // makeNativeModule() (not …WithListener) hardcodes addListener to undefined —
    // the pre-fix state on a device where the AAR predates event support.
    mockNativeModule = makeNativeModule(false);
    const mod = loadBridge();

    const handler = jest.fn();
    const unsubscribe = mod.addNotificationListener(handler);

    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('addNotificationRemovedListener degrades to a no-op unsubscribe when the native module exposes no event emitter', () => {
    mockNativeModule = makeNativeModule(false);
    const mod = loadBridge();

    const handler = jest.fn();
    const unsubscribe = mod.addNotificationRemovedListener(handler);

    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('two independent addNotificationListener subscribers each get their own native subscription', () => {
    const addListener = jest.fn(() => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    mod.addNotificationListener(jest.fn());
    mod.addNotificationListener(jest.fn());

    expect(addListener).toHaveBeenCalledTimes(2);
  });
});
