import type { LauncherModuleType } from '../index';

// The native module returned by requireNativeModule('LauncherModule').
// Swapped per test so each bridge instance captures the right behaviour.
let mockNativeModule: Record<string, jest.Mock>;

jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => mockNativeModule),
}));

function makeNativeModule(reject: boolean): Record<string, jest.Mock> {
  return new Proxy({}, {
    get: (target, prop) => {
      if (prop === 'addListener') return undefined;
      return jest.fn(() =>
        reject ? Promise.reject(new Error('native failure')) : Promise.resolve(true),
      );
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
    await expect(mod.default.getWifiInfo()).resolves.toEqual({
      enabled: false,
      ssid: '',
      rssi: 0,
      linkSpeed: 0,
      ip: '',
    });
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
