import '../index';

// Native module returned by requireNativeModule('LauncherModule'), swapped per test.
let mockNativeModule: Record<string, jest.Mock>;

jest.mock('expo', () => ({
  requireNativeModule: jest.fn(() => mockNativeModule),
}));

// Exposes a real addListener so addNotificationListener / addNotificationRemovedListener
// subscribes through it (the same fixture index.test.ts uses).
function makeNativeModuleWithListener(
  addListener: jest.Mock = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() })),
): Record<string, jest.Mock> {
  return new Proxy({}, {
    get: (_target, prop) => {
      if (prop === 'addListener') return addListener;
      return jest.fn(() => Promise.resolve(true));
    },
  }) as unknown as Record<string, jest.Mock>;
}

// Load the REAL bridge module with a fresh listener set.
function loadBridge() {
  let mod: typeof import('../index');
  jest.isolateModules(() => {
    mod = jest.requireActual('../index');
  });
  return mod!;
}

describe('notification event payload normalization (#646)', () => {
  let mod: typeof import('../index');
  let addListener: jest.Mock;

  beforeEach(() => {
    addListener = jest.fn((_event: string, _handler: (payload: unknown) => void) => ({ remove: jest.fn() }));
    mockNativeModule = makeNativeModuleWithListener(addListener);
    mod = loadBridge();
  });

  // The native NotificationService.emitToJS historically only put
  // id/packageName/title/text/postedAt on the bundle (it built a partial Bundle
  // from the StatusBarNotification directly). The screen (and DeviceNotification)
  // need key/time/isOngoing. The bridge must normalize the partial native event
  // into a full DeviceNotification so live events are usable, not dropping
  // fields or crashing.
  it('normalizes a partial onNotificationPosted payload into a full DeviceNotification (key->id, postedAt->time, isOngoing defaulted)', () => {
    const handler = jest.fn();
    mod.addNotificationListener(handler);
    const nativeHandler = addListener.mock.calls[0][1];

    const postedAt = 1_700_000_000_000;
    nativeHandler({ id: 'sbn:1|com.x|0', packageName: 'com.x', title: 'T', text: 'B', postedAt });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      id: 'sbn:1|com.x|0',
      key: 'sbn:1|com.x|0', // key falls back to id when the native event omits it
      packageName: 'com.x',
      title: 'T',
      text: 'B',
      time: postedAt, // postedAt maps to time
      isOngoing: false, // defaulted when omitted
    });
  });

  it('preserves key/time/isOngoing when the native event carries them', () => {
    const handler = jest.fn();
    mod.addNotificationListener(handler);
    const nativeHandler = addListener.mock.calls[0][1];

    nativeHandler({ id: 'id1', key: 'key1', packageName: 'com.y', title: 'T2', text: 'B2', time: 42, isOngoing: true });

    expect(handler.mock.calls[0][0]).toMatchObject({
      id: 'id1',
      key: 'key1',
      time: 42,
      isOngoing: true,
    });
  });

  // The screen removes notifications by `key`. onNotificationRemoved must
  // forward the key (not the id) so the removal matches the list. Before #646
  // it forwarded `id`, which never matched and left stale rows.
  it('addNotificationRemovedListener forwards the key (matching the screen list), not id', () => {
    const handler = jest.fn();
    mod.addNotificationRemovedListener(handler);
    const nativeHandler = addListener.mock.calls[0][1];

    nativeHandler({ id: 'idZ', key: 'keyZ', packageName: 'com.z' });

    expect(handler).toHaveBeenCalledWith('keyZ');
  });

  // A malformed/empty native event must produce a normalized (never undefined)
  // object so the screen's grouping/mapping can key it safely instead of
  // throwing and blanking the whole center.
  it('does not crash on an empty payload and yields a normalized object', () => {
    const handler = jest.fn();
    mod.addNotificationListener(handler);
    const nativeHandler = addListener.mock.calls[0][1];

    nativeHandler({});

    expect(handler.mock.calls[0][0]).toMatchObject({
      id: '',
      key: '',
      packageName: '',
      title: '',
      text: '',
      time: 0,
      isOngoing: false,
    });
  });
});
