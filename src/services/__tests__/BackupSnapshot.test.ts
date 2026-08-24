import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSnapshot, applySnapshot } from '../BackupSnapshot';

// Isolate this suite from the global jest.setup.js AsyncStorage mock, which only
// stubs getItem/setItem/removeItem. We own getMany/setMany here.
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
    getMany: jest.fn(),
    setMany: jest.fn(),
  },
}));

// In-memory backing store so getMany/setMany behave like the real storage.
function setupAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getMany as jest.Mock).mockImplementation(
    async (keys: string[]): Promise<Record<string, string | null>> => {
      const out: Record<string, string | null> = {};
      for (const k of keys) out[k] = store.has(k) ? store.get(k)! : null;
      return out;
    },
  );
  (AsyncStorage.setMany as jest.Mock).mockImplementation(
    async (entries: Record<string, string>): Promise<void> => {
      for (const [k, v] of Object.entries(entries)) store.set(k, v);
    },
  );
  return store;
}

beforeEach(() => {
  // Clear any call history leaked from other suites sharing this worker's
  // AsyncStorage module instance, then re-arm getMany/setMany implementations.
  (AsyncStorage.getMany as jest.Mock).mockClear?.();
  (AsyncStorage.setMany as jest.Mock).mockClear?.();
  setupAsyncStorage();
});

const EXPORTABLE_KEYS = [
  '@iostoandroid/settings',
  '@iostoandroid/theme_preference',
  '@iostoandroid/accent_color',
  '@iostoandroid/high_contrast',
  '@iostoandroid/a11y_textscale',
  '@iostoandroid/a11y_bold',
  '@iostoandroid/a11y_reduce_motion',
  '@iostoandroid/night_shift',
  '@iostoandroid/kbd_autocap',
  '@iostoandroid/kbd_autocorrect',
  '@iostoandroid/kbd_clicks',
  '@iostoandroid/kbd_predictive',
  '@iostoandroid/cellular_data',
  '@iostoandroid/data_roaming',
  '@iostoandroid/timezone',
  '@iostoandroid/language',
  '@iostoandroid/region',
  '@iostoandroid/ringtone',
  '@iostoandroid/text_tone',
  '@iostoandroid/custom_wallpaper',
] as const;

describe('createSnapshot', () => {
  it('returns a Record<string,string> of all EXPORTABLE_KEYS values present in storage', async () => {
    setupAsyncStorage({
      '@iostoandroid/settings': '{"vibration":true}',
      '@iostoandroid/theme_preference': 'dark',
      '@iostoandroid/language': 'pt',
    });

    const snapshot = await createSnapshot();

    expect(snapshot).toEqual({
      '@iostoandroid/settings': '{"vibration":true}',
      '@iostoandroid/theme_preference': 'dark',
      '@iostoandroid/language': 'pt',
    });
    // It only fetched the allow-listed keys, exactly once.
    expect(AsyncStorage.getMany).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.getMany).toHaveBeenCalledWith([...EXPORTABLE_KEYS]);
  });

  it('skips null entries so they do not appear in the snapshot', async () => {
    setupAsyncStorage({
      '@iostoandroid/settings': '{"vibration":true}',
      // @iostoandroid/theme_preference is absent → getMany returns null for it.
    });

    const snapshot = await createSnapshot();

    expect(snapshot).toEqual({
      '@iostoandroid/settings': '{"vibration":true}',
    });
    expect(Object.keys(snapshot)).not.toContain('@iostoandroid/theme_preference');
  });

  it('returns an empty object when no allow-listed key is present', async () => {
    setupAsyncStorage({
      '@iostoandroid/sms_messages': 'should-not-appear',
    });

    const snapshot = await createSnapshot();

    expect(snapshot).toEqual({});
  });
});

describe('applySnapshot', () => {
  it('writes only allow-listed keys via AsyncStorage.setMany', async () => {
    const data = {
      '@iostoandroid/settings': '{"vibration":false}',
      '@iostoandroid/sms_messages': 'injected', // non-settings, must be filtered out
    };

    await applySnapshot(data);

    expect(AsyncStorage.setMany).toHaveBeenCalledTimes(1);
    const written = (AsyncStorage.setMany as jest.Mock).mock.calls[0][0];
    expect(written).toEqual({
      '@iostoandroid/settings': '{"vibration":false}',
    });
    expect(written['@iostoandroid/sms_messages']).toBeUndefined();
  });

  it('rejects array input with an error', async () => {
    await expect(applySnapshot([1, 2, 3])).rejects.toThrow();
    expect(AsyncStorage.setMany).not.toHaveBeenCalled();
  });

  it('rejects a primitive (non-object) input with an error', async () => {
    await expect(applySnapshot('not-an-object')).rejects.toThrow();
    expect(AsyncStorage.setMany).not.toHaveBeenCalled();

    await expect(applySnapshot(42)).rejects.toThrow();
    expect(AsyncStorage.setMany).not.toHaveBeenCalled();
  });

  it('rejects null input (typeof object but not a usable record)', async () => {
    await expect(applySnapshot(null)).rejects.toThrow();
    expect(AsyncStorage.setMany).not.toHaveBeenCalled();
  });

  it('rejects a non-string value instead of coercing it (issue #274)', async () => {
    const data = {
      '@iostoandroid/language': 'pt',
      '@iostoandroid/high_contrast': true as unknown, // boolean value must be rejected, not coerced
    };
    await expect(applySnapshot(data as Record<string, unknown>)).rejects.toThrow();
    expect(AsyncStorage.setMany).not.toHaveBeenCalled();
  });
});
