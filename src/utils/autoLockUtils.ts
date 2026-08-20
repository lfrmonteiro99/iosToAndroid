export const AUTO_LOCK_MS: Record<string, number | null> = {
  '30 Seconds': 30_000,
  '1 Minute': 60_000,
  '2 Minutes': 120_000,
  '3 Minutes': 180_000,
  '5 Minutes': 300_000,
  Never: null,
};

// Returns the lock delay in ms for the given autoLock setting string,
// or 5000 as a fallback for unknown/legacy values.
// Returns null when the setting means "never lock".
export function resolveAutoLockDelay(setting: string): number | null {
  return setting in AUTO_LOCK_MS ? AUTO_LOCK_MS[setting] : 5_000;
}
