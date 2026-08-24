// Real bridge module, bypassing the jest.setup.js mock and moduleNameMapper.
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

describe('foreground monitor bridge (#627 child issue)', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => {
    (console.error as jest.Mock).mockRestore();
  });

  describe('setProtectedApps', () => {
    it('forwards an array of package names to the native module', async () => {
      const setProtectedApps = jest.fn(() => Promise.resolve(true));
      mockNativeModule = makeNativeModule(false, { setProtectedApps });
      const mod = loadBridge();

      await mod.default.setProtectedApps(['com.example.banking', 'com.example.gallery']);

      expect(setProtectedApps).toHaveBeenCalledWith(['com.example.banking', 'com.example.gallery']);
    });

    it('normalizes a non-array argument to [] so the service never gets a malformed payload', async () => {
      const setProtectedApps = jest.fn(() => Promise.resolve(true));
      mockNativeModule = makeNativeModule(false, { setProtectedApps });
      const mod = loadBridge();

      await mod.default.setProtectedApps(undefined as unknown as string[]);

      expect(setProtectedApps).toHaveBeenCalledWith([]);
    });

    it('returns false (fail-closed, not thrown) when the native call rejects', async () => {
      mockNativeModule = makeNativeModule(true, {
        setProtectedApps: jest.fn(() => Promise.reject(new Error('bridge down'))),
      });
      const mod = loadBridge();

      await expect(mod.default.setProtectedApps(['com.example.banking'])).resolves.toBe(false);
    });
  });

  describe('addForegroundAppListener', () => {
    it('subscribes to onForegroundAppChanged and forwards only the packageName string', () => {
      const addListener = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() }));
      mockNativeModule = makeNativeModuleWithListener(addListener);
      const mod = loadBridge();

      const handler = jest.fn();
      mod.addForegroundAppListener(handler);

      expect(addListener).toHaveBeenCalledWith('onForegroundAppChanged', expect.any(Function));

      const nativeHandler = addListener.mock.calls[0][1];
      nativeHandler({ packageName: 'com.example.banking' });

      expect(handler).toHaveBeenCalledWith('com.example.banking');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('unsubscribe calls the native subscription remove()', () => {
      const remove = jest.fn();
      const addListener = jest.fn(() => ({ remove }));
      mockNativeModule = makeNativeModuleWithListener(addListener);
      const mod = loadBridge();

      const unsubscribe = mod.addForegroundAppListener(jest.fn());
      unsubscribe();
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it('degrades to a no-op unsubscribe when the native module exposes no event emitter', () => {
      mockNativeModule = makeNativeModule(false);
      const mod = loadBridge();

      const handler = jest.fn();
      const unsubscribe = mod.addForegroundAppListener(handler);

      expect(() => unsubscribe()).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
