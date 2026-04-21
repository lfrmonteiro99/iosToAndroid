import * as Haptics from 'expo-haptics';

/**
 * Module-scope cache of whether vibration is enabled.
 * SettingsStore pushes updates via setHapticsEnabled() on mount + whenever
 * settings.vibration changes. Default true so haptics work before hydration.
 */
let cachedEnabled = true;

/** Called by SettingsStore to sync the cache with the persisted setting. */
export function setHapticsEnabled(enabled: boolean): void {
  cachedEnabled = enabled;
}

export async function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
): Promise<void> {
  if (!cachedEnabled) return;
  try { await Haptics.impactAsync(style); } catch { /* ignore */ }
}

export async function hapticNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
): Promise<void> {
  if (!cachedEnabled) return;
  try { await Haptics.notificationAsync(type); } catch { /* ignore */ }
}

export async function hapticSelection(): Promise<void> {
  if (!cachedEnabled) return;
  try { await Haptics.selectionAsync(); } catch { /* ignore */ }
}
