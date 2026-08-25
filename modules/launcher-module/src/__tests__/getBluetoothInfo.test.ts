// Regression test for issue #675: LauncherModule.getBluetoothInfo throws
// SecurityException (missing BLUETOOTH_CONNECT) on Android 12+, which the TS
// wrapper turns into a reportBridgeError -> LogBox toast on every launch.
//
// Root cause is native (modules/.../LauncherModule.kt: getBluetoothInfo reads
// adapter.name / adapter.address without a SecurityException guard — only
// pairedDevices had one). The fix there returns the intended silent fallback
// ("Unknown" / "") so the call no longer rejects. This JS-level test locks the
// contract the bridge must keep even against older native binaries: a
// Bluetooth CONNECT permission SecurityException must NOT be surfaced as a hard
// bridge error (no LogBox), while every other failure still is.

let mockNativeModule: Record<string, jest.Mock>;

jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => mockNativeModule),
}));

// Android's native SecurityException arrives over the RN bridge as an Error
// whose message embeds the Java stack cause — exactly what logcat showed:
// "Call to function 'LauncherModule.getBluetoothInfo' has been rejected.
//  -> Caused by: java.lang.SecurityException: Need android.permission.BLUETOOTH_CONNECT ..."
function bluetoothPermissionSecurityException(): Error {
  return new Error(
    "Call to function 'LauncherModule.getBluetoothInfo' has been rejected.\n" +
      '→ Caused by: java.lang.SecurityException: Need android.permission.BLUETOOTH_CONNECT permission ' +
      'from uid 10123: getName',
  );
}

function genericError(): Error {
  return new Error('native failure');
}

function makeNativeModule(impl: Record<string, jest.Mock>): Record<string, jest.Mock> {
  return new Proxy(impl, {
    get: (target, prop) => {
      if (prop in target) return (target as Record<string, jest.Mock>)[prop as string];
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

describe('getBluetoothInfo: BLUETOOTH_CONNECT SecurityException must not toast', () => {
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
    listener = jest.fn();
  });
  afterEach(() => {
    if (unsubscribe) unsubscribe();
  });

  it('resolves null (no hard error) when the native call rejects with a BLUETOOTH_CONNECT SecurityException', async () => {
    mockNativeModule = makeNativeModule({
      getBluetoothInfo: jest.fn().mockRejectedValue(bluetoothPermissionSecurityException()),
    });
    mod = loadBridge();
    unsubscribe = mod.onBridgeError(listener);

    await expect(mod.default.getBluetoothInfo()).resolves.toBeNull();
    // The whole point of #675: a known-missing optional permission must not
    // surface as a LogBox error banner.
    expect(listener).not.toHaveBeenCalled();
  });

  it('still reports any OTHER rejection (generic failure) so real bugs stay visible', async () => {
    mockNativeModule = makeNativeModule({
      getBluetoothInfo: jest.fn().mockRejectedValue(genericError()),
    });
    mod = loadBridge();
    unsubscribe = mod.onBridgeError(listener);

    await expect(mod.default.getBluetoothInfo()).resolves.toBeNull();
    expect(listener).toHaveBeenCalledWith('getBluetoothInfo', expect.any(Error));
  });

  it('passes a successful read through unchanged', async () => {
    const info = {
      enabled: true,
      name: 'Pixel Phone',
      address: 'AA:BB:CC:DD:EE:FF',
      pairedDevices: [{ name: 'EarBuds', address: '11:22:33:44:55:66', type: 1 }],
    };
    mockNativeModule = makeNativeModule({
      getBluetoothInfo: jest.fn().mockResolvedValue(info),
    });
    mod = loadBridge();
    unsubscribe = mod.onBridgeError(listener);

    await expect(mod.default.getBluetoothInfo()).resolves.toEqual(info);
    expect(listener).not.toHaveBeenCalled();
  });

  it('keeps the no-Bluetooth fallback (enabled false, name Unknown, empty address, no paired)', async () => {
    const fallback = { enabled: false, name: 'Unknown', address: '', pairedDevices: [] };
    mockNativeModule = makeNativeModule({
      getBluetoothInfo: jest.fn().mockResolvedValue(fallback),
    });
    mod = loadBridge();
    unsubscribe = mod.onBridgeError(listener);

    await expect(mod.default.getBluetoothInfo()).resolves.toEqual(fallback);
    expect(listener).not.toHaveBeenCalled();
  });
});
