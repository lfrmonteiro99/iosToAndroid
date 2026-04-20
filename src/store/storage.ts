import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * One-shot migration: copy the value from `legacy` to `next` if `next` is
 * empty, then delete the legacy key. Safe to call on every provider mount.
 */
export async function migrateAsyncStorageKey(legacy: string, next: string): Promise<void> {
  try {
    const legacyRaw = await AsyncStorage.getItem(legacy);
    if (legacyRaw === null) return; // nothing to migrate
    const existing = await AsyncStorage.getItem(next);
    if (existing === null) {
      await AsyncStorage.setItem(next, legacyRaw);
    }
    await AsyncStorage.removeItem(legacy);
  } catch {
    /* best-effort migration — ignore failures */
  }
}
