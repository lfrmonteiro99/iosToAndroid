import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@iostoandroid/settings';

/**
 * Check the persisted vibration setting before firing haptics.
 * Falls back to `true` (enabled) if the setting can't be read.
 */
async function isVibrationEnabled(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const parsed = JSON.parse(raw);
    return parsed.vibration !== false;
  } catch {
    return true;
  }
}

export async function hapticImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium,
): Promise<void> {
  if (await isVibrationEnabled()) {
    await Haptics.impactAsync(style);
  }
}

export async function hapticNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
): Promise<void> {
  if (await isVibrationEnabled()) {
    await Haptics.notificationAsync(type);
  }
}

export async function hapticSelection(): Promise<void> {
  if (await isVibrationEnabled()) {
    await Haptics.selectionAsync();
  }
}
