import type { LauncherModuleType } from '../index';
import { clampLiveActivityProgress } from '../index';

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
      // The contract is "never throw, always report": methods that return a
      // value resolve to that value, void methods resolve to undefined. We
      // assert the rejection path is swallowed and routed to onBridgeError
      // rather than relying on a defined return value (a Promise<void> method
      // legitimately resolves to undefined — see wakeScreen, #608).
      await expect(fn()).resolves.not.toThrow();
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

// #508: Android re-delivers the HOME intent via onNewIntent (singleTask
// launchMode) instead of recreating the Activity, but nothing on the JS side
// was listening for it — HOME did nothing while the launcher was already in
// the foreground. This is the bridge half of the fix: forwarding the native
// "onHomePressed" event (emitted only for CATEGORY_HOME — see MainActivity's
// override, injected by plugins/withLauncherIntent.js) to a JS listener.
describe('LauncherModule HOME button listener (event-driven, #508)', () => {
  it('addHomePressedListener subscribes to onHomePressed', () => {
    const addListener = jest.fn((_event: string, _handler: () => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const handler = jest.fn();
    mod.addHomePressedListener(handler);

    expect(addListener).toHaveBeenCalledWith('onHomePressed', expect.any(Function));
  });

  it('addHomePressedListener invokes the caller-supplied handler when the native event fires', () => {
    const addListener = jest.fn((_event: string, _handler: () => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const handler = jest.fn();
    mod.addHomePressedListener(handler);

    const nativeHandler = addListener.mock.calls[0][1];
    nativeHandler();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('addHomePressedListener unsubscribe calls the native subscription remove() exactly once', () => {
    const remove = jest.fn();
    const addListener = jest.fn(() => ({ remove }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const unsubscribe = mod.addHomePressedListener(jest.fn());
    expect(remove).not.toHaveBeenCalled();

    unsubscribe();
    unsubscribe(); // calling twice must not double-invoke or throw
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('addHomePressedListener degrades to a no-op unsubscribe when the native module exposes no event emitter', () => {
    // makeNativeModule() (not …WithListener) hardcodes addListener to undefined —
    // the pre-fix state on a device where the AAR predates event support.
    mockNativeModule = makeNativeModule(false);
    const mod = loadBridge();

    const handler = jest.fn();
    const unsubscribe = mod.addHomePressedListener(handler);

    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });

  it('two independent addHomePressedListener subscribers each get their own native subscription', () => {
    const addListener = jest.fn(() => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    mod.addHomePressedListener(jest.fn());
    mod.addHomePressedListener(jest.fn());

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

describe('wakeScreen — Tap to Wake bridge (#608)', () => {
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
    mockNativeModule = makeNativeModule(false);
    mod = loadBridge();
    listener = jest.fn();
    unsubscribe = mod.onBridgeError(listener);
  });
  afterEach(() => {
    unsubscribe();
  });

  it('is exposed as a Promise<void> method on the bridge', () => {
    expect(typeof mod.default.wakeScreen).toBe('function');
    // A Promise<void> method must resolve (to undefined), never reject, on success.
    expect(mod.default.wakeScreen()).toBeInstanceOf(Promise);
  });

  it('calls the native wakeScreen function when invoked', async () => {
    // Capture the same mock instance the proxy will hand back on every access.
    const native = jest.fn(() => Promise.resolve());
    mockNativeModule = makeNativeModule(false, { wakeScreen: native });
    mod = loadBridge();
    await mod.default.wakeScreen();
    expect(native).toHaveBeenCalledTimes(1);
  });

  it('reports a native failure to onBridgeError listeners instead of throwing', async () => {
    mockNativeModule = makeNativeModule(true);
    mod = loadBridge();
    const failingListener = jest.fn();
    const unsub = mod.onBridgeError(failingListener);

    // Must swallow the rejection (Promise<void>): resolves, does not throw.
    await expect(mod.default.wakeScreen()).resolves.toBeUndefined();
    expect(failingListener).toHaveBeenCalledWith('wakeScreen', expect.any(Error));
    unsub();
  });

  it('does not report to onBridgeError when the native call succeeds', async () => {
    // default makeNativeModule(false) → wakeScreen resolves true/undefined.
    const okListener = jest.fn();
    const unsub = mod.onBridgeError(okListener);
    await mod.default.wakeScreen();
    expect(okListener).not.toHaveBeenCalled();
    unsub();
  });
});

describe('clampLiveActivityProgress — live-activity progress normalization (#626)', () => {
  it('computes a rounded percentage within [0, maxProgress]', () => {
    expect(clampLiveActivityProgress(50, 100)).toEqual({ percent: 50, indeterminate: false });
    expect(clampLiveActivityProgress(1, 3)).toEqual({ percent: 33, indeterminate: false }); // rounds 33.33 -> 33
  });

  it('boundary: progress at 0 and exactly at maxProgress', () => {
    expect(clampLiveActivityProgress(0, 100)).toEqual({ percent: 0, indeterminate: false });
    expect(clampLiveActivityProgress(100, 100)).toEqual({ percent: 100, indeterminate: false });
  });

  it('clamps out-of-range progress instead of producing an invalid percentage', () => {
    expect(clampLiveActivityProgress(-10, 100)).toEqual({ percent: 0, indeterminate: false });
    expect(clampLiveActivityProgress(150, 100)).toEqual({ percent: 100, indeterminate: false });
  });

  it('treats maxProgress <= 0 as indeterminate (no known total) instead of dividing by zero', () => {
    expect(clampLiveActivityProgress(5, 0)).toEqual({ percent: 0, indeterminate: true });
    expect(clampLiveActivityProgress(5, -1)).toEqual({ percent: 0, indeterminate: true });
  });

  it('treats non-finite inputs as indeterminate rather than throwing or returning NaN', () => {
    expect(clampLiveActivityProgress(NaN, 100)).toEqual({ percent: 0, indeterminate: true });
    expect(clampLiveActivityProgress(5, Infinity)).toEqual({ percent: 0, indeterminate: true });
    expect(clampLiveActivityProgress(-Infinity, 100)).toEqual({ percent: 0, indeterminate: true });
  });
});

describe('postLiveActivity / cancelLiveActivity bridge (#626)', () => {
  let mod: typeof import('../index');

  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });

  it('normalizes progress/maxProgress into percent/indeterminate before calling native', async () => {
    const native = jest.fn(() => Promise.resolve(true));
    mockNativeModule = makeNativeModule(false, { postLiveActivity: native });
    mod = loadBridge();

    await mod.default.postLiveActivity('order-42', 'Driver arriving', '2 min away', 8, 10);

    expect(native).toHaveBeenCalledWith('order-42', 'Driver arriving', '2 min away', 80, false);
  });

  it('passes an empty id through to native rather than silently swallowing it — the guard belongs to useLiveActivity, not the bridge', async () => {
    const native = jest.fn(() => Promise.resolve(true));
    mockNativeModule = makeNativeModule(false, { postLiveActivity: native });
    mod = loadBridge();

    await mod.default.postLiveActivity('', 'x', 'y', 1, 1);

    expect(native).toHaveBeenCalledWith('', 'x', 'y', 100, false);
  });

  it('reports a native postLiveActivity failure to onBridgeError instead of throwing', async () => {
    mockNativeModule = makeNativeModule(true);
    mod = loadBridge();
    const listener = jest.fn();
    const unsub = mod.onBridgeError(listener);

    await expect(mod.default.postLiveActivity('order-42', 'x', 'y', 1, 2)).resolves.toBe(false);
    expect(listener).toHaveBeenCalledWith('postLiveActivity', expect.any(Error));
    unsub();
  });

  it('cancelLiveActivity calls native cancel with the given id', async () => {
    const native = jest.fn(() => Promise.resolve(true));
    mockNativeModule = makeNativeModule(false, { cancelLiveActivity: native });
    mod = loadBridge();

    await mod.default.cancelLiveActivity('order-42');

    expect(native).toHaveBeenCalledWith('order-42');
  });

  it('passes an empty id through to native rather than silently swallowing it — the guard belongs to useLiveActivity, not the bridge', async () => {
    const native = jest.fn(() => Promise.resolve(true));
    mockNativeModule = makeNativeModule(false, { cancelLiveActivity: native });
    mod = loadBridge();

    await mod.default.cancelLiveActivity('');

    expect(native).toHaveBeenCalledWith('');
  });

  it('reports a native cancelLiveActivity failure to onBridgeError instead of throwing', async () => {
    mockNativeModule = makeNativeModule(true);
    mod = loadBridge();
    const listener = jest.fn();
    const unsub = mod.onBridgeError(listener);

    await expect(mod.default.cancelLiveActivity('order-42')).resolves.toBe(false);
    expect(listener).toHaveBeenCalledWith('cancelLiveActivity', expect.any(Error));
    unsub();
  });

  it('reports a native startTapDetection failure to onBridgeError instead of throwing', async () => {
    mockNativeModule = makeNativeModule(true);
    mod = loadBridge();
    const listener = jest.fn();
    const unsub = mod.onBridgeError(listener);

    await expect(mod.default.startTapDetection()).resolves.toBe(false);
    expect(listener).toHaveBeenCalledWith('startTapDetection', expect.any(Error));
    unsub();
  });

  it('reports a native stopTapDetection failure to onBridgeError instead of throwing', async () => {
    mockNativeModule = makeNativeModule(true);
    mod = loadBridge();
    const listener = jest.fn();
    const unsub = mod.onBridgeError(listener);

    await expect(mod.default.stopTapDetection()).resolves.toBe(false);
    expect(listener).toHaveBeenCalledWith('stopTapDetection', expect.any(Error));
    unsub();
  });
});

// #636: the native TapSensorService emits `onBackTap` for double/triple back
// taps; this is the bridge half that forwards that payload to a JS listener.
describe('LauncherModule Back Tap listener (event-driven, #636)', () => {
  it('addBackTapListener subscribes to onBackTap', () => {
    const addListener = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    mod.addBackTapListener(jest.fn());

    expect(addListener).toHaveBeenCalledWith('onBackTap', expect.any(Function));
  });

  it('addBackTapListener forwards the typed payload (type, count, taps) to the caller', () => {
    const addListener = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const handler = jest.fn();
    mod.addBackTapListener(handler);

    const nativeHandler = addListener.mock.calls[0][1];
    const payload = { type: 'double', count: 2, taps: [1000, 1200] };
    nativeHandler(payload);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(handler.mock.calls[0][0]).toMatchObject({ type: 'double', count: 2 });
    expect(handler.mock.calls[0][0].taps).toEqual([1000, 1200]);
  });

  it('addBackTapListener unsubscribe calls the native subscription remove() exactly once (double-call safe)', () => {
    const remove = jest.fn();
    const addListener = jest.fn(() => ({ remove }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    const mod = loadBridge();

    const unsubscribe = mod.addBackTapListener(jest.fn());
    expect(remove).not.toHaveBeenCalled();

    unsubscribe();
    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('addBackTapListener degrades to a no-op unsubscribe when the native module exposes no event emitter', () => {
    mockNativeModule = makeNativeModule(false);
    const mod = loadBridge();

    const handler = jest.fn();
    const unsubscribe = mod.addBackTapListener(handler);

    expect(() => unsubscribe()).not.toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
