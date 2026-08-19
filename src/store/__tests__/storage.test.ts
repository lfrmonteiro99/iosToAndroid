import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateAsyncStorageKey, draftStorageKey, draftLegacyStorageKey } from '../storage';

// Stateful in-memory AsyncStorage mock: setItem persists so a subsequent
// getItem returns what was written — unlike the stateless default mock.
function setupMemoryAsyncStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? store.get(key) : null,
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  setupMemoryAsyncStorage();
});

describe('migrateAsyncStorageKey', () => {
  it('copies the legacy value to the new key and removes the legacy key', async () => {
    setupMemoryAsyncStorage({ '@folders': '["legacy-data"]' });

    await migrateAsyncStorageKey('@folders', '@iostoandroid/folders');

    expect(await AsyncStorage.getItem('@iostoandroid/folders')).toBe('["legacy-data"]');
    expect(await AsyncStorage.getItem('@folders')).toBeNull();
  });

  it('preserves the new-key value when BOTH keys exist (no overwrite)', async () => {
    setupMemoryAsyncStorage({
      '@folders': '["legacy-data"]',
      '@iostoandroid/folders': '["newer-data"]',
    });

    await migrateAsyncStorageKey('@folders', '@iostoandroid/folders');

    expect(await AsyncStorage.getItem('@iostoandroid/folders')).toBe('["newer-data"]');
    expect(await AsyncStorage.getItem('@folders')).toBeNull();
  });

  it('leaves the new key untouched when only the new key exists', async () => {
    setupMemoryAsyncStorage({ '@iostoandroid/folders': '["new-only"]' });

    await migrateAsyncStorageKey('@folders', '@iostoandroid/folders');

    expect(await AsyncStorage.getItem('@iostoandroid/folders')).toBe('["new-only"]');
    expect(await AsyncStorage.getItem('@folders')).toBeNull();
  });

  it('is a no-op on a fresh install (no legacy, no new)', async () => {
    await migrateAsyncStorageKey('@folders', '@iostoandroid/folders');

    expect(await AsyncStorage.getItem('@iostoandroid/folders')).toBeNull();
    expect(await AsyncStorage.getItem('@folders')).toBeNull();
  });

  it('is idempotent when called twice in a row', async () => {
    setupMemoryAsyncStorage({ '@folders': '["data"]' });

    await migrateAsyncStorageKey('@folders', '@iostoandroid/folders');
    await migrateAsyncStorageKey('@folders', '@iostoandroid/folders');

    expect(await AsyncStorage.getItem('@iostoandroid/folders')).toBe('["data"]');
    expect(await AsyncStorage.getItem('@folders')).toBeNull();
  });

  it('does not throw when storage access fails (best-effort migration)', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('storage unavailable'));

    await expect(
      migrateAsyncStorageKey('@folders', '@iostoandroid/folders'),
    ).resolves.toBeUndefined();
  });
});

describe('draft key helpers', () => {
  it('builds namespaced and legacy draft keys from an address', () => {
    expect(draftStorageKey('+15551234567')).toBe('@iostoandroid/draft_+15551234567');
    expect(draftLegacyStorageKey('+15551234567')).toBe('@draft_+15551234567');
  });
});
