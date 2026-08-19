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

// Per-address message draft keys. The legacy form (`@draft_<address>`) predates
// the @iostoandroid/ namespace and is only read as a migration source.
export function draftStorageKey(address: string): string {
  return `@iostoandroid/draft_${address}`;
}

export function draftLegacyStorageKey(address: string): string {
  return `@draft_${address}`;
}
