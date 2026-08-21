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

describe('requireNativeModule try/catch hardening', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('exports the stub (not undefined) when requireNativeModule throws on Android', async () => {
    const { requireNativeModule } = jest.requireMock('expo') as { requireNativeModule: jest.Mock };
    requireNativeModule.mockImplementationOnce(() => { throw new Error('module not found'); });

    let mod: typeof import('../index');
    jest.isolateModules(() => { mod = jest.requireActual('../index'); });

    // The module must export a callable default (the stub), never crash at import time.
    expect(mod!.default).toBeDefined();
    // Stub methods resolve to their default values without throwing.
    await expect(mod!.default.getInstalledApps()).resolves.toEqual([]);
    await expect(mod!.default.getInstalledKeyboards()).resolves.toEqual([]);
    await expect(mod!.default.getRingtone()).resolves.toBe('');
    await expect(mod!.default.canWriteSystemSettings()).resolves.toBe(false);
  });
});

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

// PackageManager.queryIntentActivities yields one entry per launcher activity,
// not one per package, so an app registering several (Google also registers
// "Voice Search") reaches JS as repeated packageNames. Consumers key React
// lists by packageName (AppLibraryScreen, MultitaskScreen, StorageScreen, …)
// and StorageScreen sums totalBytes per entry, so duplicates both collide as
// keys and inflate the Apps storage total.
describe('deduplication of launcher entries by packageName', () => {
  const GOOGLE = 'com.google.android.googlequicksearchbox';

  const app = (name: string, packageName: string) => ({
    name, packageName, icon: '', isSystem: true,
  });
  const stat = (appName: string, packageName: string, totalBytes: number) => ({
    packageName, appName, totalBytes, cacheBytes: 0,
  });

  function bridgeReturning(method: string, value: unknown) {
    mockNativeModule = makeNativeModule(false, {
      [method]: jest.fn(() => Promise.resolve(value)),
    });
    return loadBridge();
  }

  it('collapses two launcher activities of the same package into one app, keeping the first', async () => {
    const mod = bridgeReturning('getInstalledApps', [
      app('Google', GOOGLE),
      app('Voice Search', GOOGLE),
    ]);

    const apps = await mod.default.getInstalledApps();

    expect(apps).toHaveLength(1);
    expect(apps[0].name).toBe('Google');
  });

  it('collapses three or more launcher activities of the same package into one app', async () => {
    const mod = bridgeReturning('getInstalledApps', [
      app('Google', GOOGLE),
      app('Voice Search', GOOGLE),
      app('Google Lens', GOOGLE),
    ]);

    await expect(mod.default.getInstalledApps()).resolves.toHaveLength(1);
  });

  it('keeps every distinct package and preserves the native ordering', async () => {
    const mod = bridgeReturning('getInstalledApps', [
      app('Camera', 'com.android.camera'),
      app('Google', GOOGLE),
      app('Settings', 'com.android.settings'),
    ]);

    const apps = await mod.default.getInstalledApps();

    expect(apps.map(a => a.packageName)).toEqual([
      'com.android.camera', GOOGLE, 'com.android.settings',
    ]);
  });

  it('keeps the first occurrence of each package when a duplicate sits mid-list', async () => {
    const mod = bridgeReturning('getInstalledApps', [
      app('Camera', 'com.android.camera'),
      app('Google', GOOGLE),
      app('Voice Search', GOOGLE),
      app('Settings', 'com.android.settings'),
    ]);

    const apps = await mod.default.getInstalledApps();

    expect(apps.map(a => a.name)).toEqual(['Camera', 'Google', 'Settings']);
  });

  it('returns an empty list unchanged', async () => {
    const mod = bridgeReturning('getInstalledApps', []);

    await expect(mod.default.getInstalledApps()).resolves.toEqual([]);
  });

  it('dedupes getAppStorageStats so a duplicated package is not counted twice', async () => {
    const mod = bridgeReturning('getAppStorageStats', [
      stat('Google', GOOGLE, 500),
      stat('Voice Search', GOOGLE, 500),
    ]);

    const stats = await mod.default.getAppStorageStats();

    expect(stats).toHaveLength(1);
    // StorageScreen sums totalBytes across entries to size the "Apps" category;
    // before the fix this reported 1000 bytes for a 500-byte package.
    expect(stats.reduce((sum, s) => sum + s.totalBytes, 0)).toBe(500);
  });

  it('keeps entries whose packageName is missing or empty instead of collapsing them together', async () => {
    const mod = bridgeReturning('getInstalledApps', [
      app('No package', ''),
      app('Also no package', ''),
    ]);

    // An unkeyable entry is malformed native data, not a duplicate — dropping it
    // would hide the problem, so both survive.
    await expect(mod.default.getInstalledApps()).resolves.toHaveLength(2);
  });

  it('still reports bridge errors and falls back to an empty list when the native call rejects', async () => {
    const errors: string[] = [];
    mockNativeModule = makeNativeModule(true);
    const mod = loadBridge();
    mod.onBridgeError((method) => { errors.push(method); });

    await expect(mod.default.getInstalledApps()).resolves.toEqual([]);
    expect(errors).toContain('getInstalledApps');
  });

  // O teste anterior daqui afirmava que uma categoria devolvida pelo mock chegava
  // ao consumidor — passava com o codigo de producao revertido, porque so testava
  // o pass-through do proprio mock. Estes tres testam o que a ponte FAZ.

  it('passa as categorias do nativo intactas, incluindo valores que ainda nao conhece', async () => {
    const mod = bridgeReturning('getInstalledApps', [
      { name: 'Jogo', packageName: 'com.example.game', icon: '', isSystem: false, category: 'game' },
      // Uma categoria de uma API futura: tem de sobreviver, nao ser coagida.
      { name: 'Futuro', packageName: 'com.example.future', icon: '', isSystem: false, category: 'wellbeing' },
    ] as Parameters<typeof bridgeReturning>[1]);

    const apps = await mod.default.getInstalledApps();

    expect(apps.map((a) => a.category)).toEqual(['game', 'wellbeing']);
  });

  it('preenche category com "undefined" quando o nativo nao a manda (API 24/25, ou modulo antigo)', async () => {
    // Um dispositivo em API 24/25 nao tem ApplicationInfo.category, e um APK com
    // uma versao anterior deste modulo nativo tambem nao a manda. O campo e
    // declarado obrigatorio em InstalledApp: sem normalizacao, o consumidor recebe
    // undefined num campo tipado como string e o TypeScript nao avisa, porque a
    // fronteira nativa e `any`.
    const mod = bridgeReturning('getInstalledApps', [
      { name: 'Sem categoria', packageName: 'com.example.old', icon: '', isSystem: false },
    ] as unknown as Parameters<typeof bridgeReturning>[1]);

    const apps = await mod.default.getInstalledApps();

    expect(apps).toHaveLength(1);
    expect(apps[0].category).toBe('undefined');
    // E nao inventa nada no resto da entrada.
    expect(apps[0].packageName).toBe('com.example.old');
    expect(apps[0].name).toBe('Sem categoria');
  });

  it('normaliza uma category que nao e string sem descartar a aplicacao', async () => {
    const mod = bridgeReturning('getInstalledApps', [
      { name: 'Numero', packageName: 'com.example.num', icon: '', isSystem: false, category: 3 },
      { name: 'Nulo', packageName: 'com.example.null', icon: '', isSystem: false, category: null },
    ] as unknown as Parameters<typeof bridgeReturning>[1]);

    const apps = await mod.default.getInstalledApps();

    // Nenhuma app se perde: uma categoria malformada nao e razao para a esconder.
    expect(apps).toHaveLength(2);
    expect(apps.map((a) => a.category)).toEqual(['undefined', 'undefined']);
  });
});
